import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, CheckCircle, AlertCircle, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ScriptApprovalDialog } from "@/components/script-approval-dialog";
import { supabase } from "@/lib/supabase";

const formSchema = z.object({
  episodeName: z.string().min(3, {
    message: "Episode name must be at least 3 characters.",
  }),
  pdfFile: z.instanceof(File).refine(
    (file) => file.size > 0 && file.type === "application/pdf",
    {
      message: "Please upload a valid PDF file.",
    }
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface ScriptType {
  id: number;
  name: string;
  responseKey: string;
  readOnly?: boolean;
}

// Define the webhook response type
interface WebhookResponseItem {
  id?: string;
  episode_interview_script_1?: string;
  episode_interview_script_2?: string;
  episode_interview_script_3?: string;
  episode_interview_script_4?: string;
  episode_interview_full_script?: string;
  episode_interview_file?: string;
  episode_interview_script_status?: string;
  episode_text_files_status?: string; // New column
  podcast_status?: string; // New column
  [key: string]: any; // For other fields we don't explicitly need
}

// Interface for script links passed from parent
interface ScriptLinks {
  episode_interview_script_1: string | null;
  episode_interview_script_2: string | null;
  episode_interview_script_3: string | null;
  episode_interview_script_4: string | null;
  episode_interview_full_script?: string | null;
  episode_interview_file?: string | null;
  episode_interview_script_status?: string;
  episode_text_files_status?: string; // New column
  podcast_status?: string; // New column
}

interface PodcastFormProps {
  selectedScriptLinks?: ScriptLinks | null;
  selectedEpisodeName?: string | null;
}

// Helper function to check if a script link is valid - MOVED UP before it's used
const isValidScriptLink = (link: string | null): boolean => {
  return link !== null && link !== undefined && link.trim() !== '';
};

export function PodcastForm({ selectedScriptLinks, selectedEpisodeName }: PodcastFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScriptGenerated, setIsScriptGenerated] = useState(false);
  const [scriptStatus, setScriptStatus] = useState<"Pending" | "Approved">("Pending");
  const [textFilesStatus, setTextFilesStatus] = useState<string | null>(null); // New state
  const [podcastStatus, setPodcastStatus] = useState<string | null>(null); // New state
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  
  // Initialize with null values instead of empty strings to properly indicate absence of links
  const [scriptLinks, setScriptLinks] = useState<Record<string, string | null>>({
    episode_interview_script_1: null,
    episode_interview_script_2: null,
    episode_interview_script_3: null,
    episode_interview_script_4: null,
    episode_interview_full_script: null,
    episode_interview_file: null
  });
  
  // Store form data for retrying
  const lastSubmittedData = useRef<FormValues | null>(null);
  
  // Error details for debugging
  const [lastError, setLastError] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  
  // Store the timestamp when the form was submitted
  const submissionTimestamp = useRef<number | null>(null);
  
  // Store the current episode name for notifications
  const currentEpisodeName = useRef<string | null>(null);
  
  // Store the current episode ID for checking script4 value
  const currentEpisodeId = useRef<string | null>(null);
  
  // Interval for checking script4 value
  const script4CheckIntervalRef = useRef<number | null>(null);
  
  // Interval for refreshing episodes list
  const refreshIntervalRef = useRef<number | null>(null);
  
  // Track if we've already found a matching record
  const foundMatchingRecord = useRef<boolean>(false);
  
  // Store the last check time to avoid checking too frequently
  const lastCheckTime = useRef<number>(0);
  
  // Maximum time to wait for a response (in milliseconds) - 2 minutes
  const MAX_WAIT_TIME = 2 * 60 * 1000;
  
  // Timeout reference for the maximum wait time
  const maxWaitTimeoutRef = useRef<number | null>(null);
  
  // Flag to track if we're checking for existing records
  const isCheckingExistingRecords = useRef<boolean>(false);
  
  // Reference to the file input element
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Flag to track if we need to clear the PDF file
  const shouldClearPdfFile = useRef<boolean>(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      episodeName: "",
    }
  });

  const scriptTypes: ScriptType[] = [
    { id: 1, name: "Script #1 - 3 Key Points", responseKey: "episode_interview_script_1" },
    { id: 2, name: "Script #2 - What it Means", responseKey: "episode_interview_script_2" },
    { id: 3, name: "Script #3 - Practical Application", responseKey: "episode_interview_script_3" },
    { id: 4, name: "Script #4 - Summary", responseKey: "episode_interview_script_4" },
    { id: 5, name: "Episode Interview Full Script", responseKey: "episode_interview_full_script", readOnly: true },
    { id: 6, name: "Episode Interview File", responseKey: "episode_interview_file", readOnly: true }
  ];

  // Check if Script #4 has a valid link
  const hasScript4 = isValidScriptLink(scriptLinks.episode_interview_script_4);

  // Check if Script #1 has a valid link
  const hasScript1 = isValidScriptLink(scriptLinks.episode_interview_script_1);

  // Check if an episode is selected
  const isEpisodeSelected = selectedEpisodeName !== null && selectedEpisodeName !== undefined && selectedEpisodeName.trim() !== '';

  // Update form when selectedScriptLinks changes
  useEffect(() => {
    if (selectedScriptLinks) {
      // Update script links
      setScriptLinks({
        episode_interview_script_1: selectedScriptLinks.episode_interview_script_1,
        episode_interview_script_2: selectedScriptLinks.episode_interview_script_2,
        episode_interview_script_3: selectedScriptLinks.episode_interview_script_3,
        episode_interview_script_4: selectedScriptLinks.episode_interview_script_4,
        episode_interview_full_script: selectedScriptLinks.episode_interview_full_script || null,
        episode_interview_file: selectedScriptLinks.episode_interview_file || null
      });
      
      // Update script status if available
      if (selectedScriptLinks.episode_interview_script_status) {
        setScriptStatus(selectedScriptLinks.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
      } else {
        setScriptStatus("Pending");
      }
      
      // Update new status fields
      if (selectedScriptLinks.episode_text_files_status) {
        setTextFilesStatus(selectedScriptLinks.episode_text_files_status);
      } else {
        setTextFilesStatus(null);
      }
      
      if (selectedScriptLinks.podcast_status) {
        setPodcastStatus(selectedScriptLinks.podcast_status);
      } else {
        setPodcastStatus(null);
      }
      
      // Set isScriptGenerated to true if any script link exists
      const hasAnyScript = Object.values(selectedScriptLinks).some(link => 
        link !== null && link !== undefined && link !== ''
      );
      setIsScriptGenerated(hasAnyScript);
      
      // If episode name is provided, update the form field
      if (selectedEpisodeName && selectedEpisodeName.trim() !== '') {
        setValue("episodeName", selectedEpisodeName);
      }
    } else {
      // If no script links are selected, reset the form field
      setValue("episodeName", "");
      
      // Reset script links
      setScriptLinks({
        episode_interview_script_1: null,
        episode_interview_script_2: null,
        episode_interview_script_3: null,
        episode_interview_script_4: null,
        episode_interview_full_script: null,
        episode_interview_file: null
      });
      
      // Reset script status
      setScriptStatus("Pending");
      setTextFilesStatus(null);
      setPodcastStatus(null);
      setIsScriptGenerated(false);
    }
  }, [selectedScriptLinks, selectedEpisodeName, setValue]);

  // Set up automatic refreshing of episodes list every second
  useEffect(() => {
    // Start the refresh interval
    if (refreshIntervalRef.current === null) {
      refreshIntervalRef.current = window.setInterval(() => {
        // Dispatch a custom event to trigger refresh in EpisodesList component
        window.dispatchEvent(new CustomEvent('episodes-list-auto-refresh'));
      }, 1000); // Refresh every second
    }
    
    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current !== null) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, []);

  // Clean up intervals when component unmounts or submission state changes
  useEffect(() => {
    if (!isSubmitting) {
      // Clear the script4 check interval if it exists
      if (script4CheckIntervalRef.current !== null) {
        window.clearInterval(script4CheckIntervalRef.current);
        script4CheckIntervalRef.current = null;
      }
      
      // Clear the max wait timeout if it exists
      if (maxWaitTimeoutRef.current !== null) {
        window.clearTimeout(maxWaitTimeoutRef.current);
        maxWaitTimeoutRef.current = null;
      }
      
      // Reset the foundMatchingRecord flag when submission ends
      foundMatchingRecord.current = false;
      
      // Reset the isCheckingExistingRecords flag
      isCheckingExistingRecords.current = false;
      
      // If we should clear the PDF file, do it now
      if (shouldClearPdfFile.current) {
        clearPdfFile();
        shouldClearPdfFile.current = false;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (script4CheckIntervalRef.current !== null) {
        window.clearInterval(script4CheckIntervalRef.current);
        script4CheckIntervalRef.current = null;
      }
      
      if (maxWaitTimeoutRef.current !== null) {
        window.clearTimeout(maxWaitTimeoutRef.current);
        maxWaitTimeoutRef.current = null;
      }
    };
  }, [isSubmitting]);

  // Listen for episodes-list-refresh event to check for new rows
  useEffect(() => {
    const handleEpisodesListRefresh = () => {
      // Only check if we're currently submitting and haven't found a match yet
      if (isSubmitting && !foundMatchingRecord.current && currentEpisodeName.current) {
        checkForNewRow();
      }
    };

    // Add event listener
    window.addEventListener('episodes-list-refresh', handleEpisodesListRefresh);
    
    // Cleanup
    return () => {
      window.removeEventListener('episodes-list-refresh', handleEpisodesListRefresh);
    };
  }, [isSubmitting]);

  // Function to clear the PDF file
  const clearPdfFile = () => {
    console.log("Clearing PDF file");
    
    // Clear the selected file state
    setSelectedFile(null);
    
    // Reset the file input value using the ref
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Also try to reset using getElementById as a fallback
    const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Effect to clear the selected file when submission completes
  useEffect(() => {
    // When isSubmitting changes from true to false and we have found a matching record,
    // clear the selected file
    if (!isSubmitting && foundMatchingRecord.current) {
      console.log("Submission completed, clearing PDF file");
      clearPdfFile();
    }
  }, [isSubmitting]);

  // Update processing status when script links change
  useEffect(() => {
    if (isSubmitting || hasScript1) {
      if (hasScript1 && !hasScript4) {
        setProcessingStatus("Script #1 has been generated, kindly wait for the other scripts to load");
      } else if (hasScript4) {
        setProcessingStatus(null); // Clear the status when all scripts are loaded
        
        // IMPORTANT: Make sure to stop the loading state when Script #4 is available
        if (isSubmitting) {
          setIsSubmitting(false);
          shouldClearPdfFile.current = true;
        }
      }
    } else {
      setProcessingStatus(null);
    }
  }, [scriptLinks, isSubmitting, hasScript1, hasScript4]);

  // Function to check if a new row has been created for the current episode
  const checkForNewRow = async () => {
    if (!currentEpisodeName.current || !isSubmitting || foundMatchingRecord.current || isCheckingExistingRecords.current) return;
    
    // Set the checking flag to prevent concurrent checks
    isCheckingExistingRecords.current = true;
    
    try {
      console.log(`Checking for new row with episode name: ${currentEpisodeName.current}`);
      
      // Query the database for records with the current episode name
      const { data, error } = await supabase
        .from('autoworkflow')
        .select('id, created_at, episode_interview_file_name, episode_interview_script_1, episode_interview_script_2, episode_interview_script_3, episode_interview_script_4, episode_interview_full_script, episode_interview_file, episode_interview_script_status, episode_text_files_status, podcast_status')
        .eq('episode_interview_file_name', currentEpisodeName.current);
      
      if (error) {
        console.error('Error checking for new row:', error);
        isCheckingExistingRecords.current = false;
        return;
      }
      
      // If we found matching records
      if (data && data.length > 0) {
        console.log('Found matching records:', data);
        
        // Sort by created_at to get the most recent record
        const sortedRecords = [...data].sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA; // Sort in descending order (newest first)
        });
        
        const mostRecentRecord = sortedRecords[0];
        
        // IMPORTANT: We're now stopping the loading state as soon as we find ANY record with the matching episode name
        console.log('Found record for current episode:', mostRecentRecord);
        
        // Mark that we've found a matching record to prevent further checks
        foundMatchingRecord.current = true;
        
        // Store the record ID
        currentEpisodeId.current = mostRecentRecord.id;
        
        // Update all script links
        setScriptLinks({
          episode_interview_script_1: mostRecentRecord.episode_interview_script_1 || null,
          episode_interview_script_2: mostRecentRecord.episode_interview_script_2 || null,
          episode_interview_script_3: mostRecentRecord.episode_interview_script_3 || null,
          episode_interview_script_4: mostRecentRecord.episode_interview_script_4 || null,
          episode_interview_full_script: mostRecentRecord.episode_interview_full_script || null,
          episode_interview_file: mostRecentRecord.episode_interview_file || null
        });
        
        // Set script generated flag if any script exists
        const hasAnyScript = mostRecentRecord.episode_interview_script_1 || 
                            mostRecentRecord.episode_interview_script_2 || 
                            mostRecentRecord.episode_interview_script_3 || 
                            mostRecentRecord.episode_interview_script_4;
        
        setIsScriptGenerated(!!hasAnyScript);
        
        // Update script status if available
        if (mostRecentRecord.episode_interview_script_status) {
          setScriptStatus(mostRecentRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
        }
        
        // Update new status fields
        if (mostRecentRecord.episode_text_files_status) {
          setTextFilesStatus(mostRecentRecord.episode_text_files_status);
        }
        
        if (mostRecentRecord.podcast_status) {
          setPodcastStatus(mostRecentRecord.podcast_status);
        }
        
        // Check if Script #1 is available but not Script #4
        const hasScript1 = !!mostRecentRecord.episode_interview_script_1;
        const hasScript4 = !!mostRecentRecord.episode_interview_script_4;
        
        if (hasScript1 && !hasScript4) {
          // Keep the loading state active but update the processing status
          setProcessingStatus("Script #1 has been generated, kindly wait for the other scripts to load");
        } else if (hasScript4) {
          // Stop the loading state when all scripts are available
          setIsSubmitting(false);
          shouldClearPdfFile.current = true;
          
          // Clear the script4 check interval
          if (script4CheckIntervalRef.current !== null) {
            window.clearInterval(script4CheckIntervalRef.current);
            script4CheckIntervalRef.current = null;
          }
          
          // Clear the max wait timeout
          if (maxWaitTimeoutRef.current !== null) {
            window.clearTimeout(maxWaitTimeoutRef.current);
            maxWaitTimeoutRef.current = null;
          }
          
          // Show notification
          toast({
            title: "Success!",
            description: `Scripts for "${currentEpisodeName.current}" have been generated.`,
            variant: "default",
          });
        }
      }
    } catch (err) {
      console.error('Error in checkForNewRow:', err);
    } finally {
      // Reset the checking flag
      isCheckingExistingRecords.current = false;
    }
  };

  // Set up subscription to listen for changes in the autoworkflow table
  useEffect(() => {
    // Subscribe to INSERT events
    const insertSubscription = supabase
      .channel('autoworkflow-inserts')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'autoworkflow' 
      }, (payload) => {
        console.log('New record created in Supabase:', payload);
        
        // Only process if we're currently submitting and have an episode name
        if (isSubmitting && currentEpisodeName.current && !foundMatchingRecord.current) {
          const newRecord = payload.new as any;
          
          // Check if this is the record for our current episode
          if (newRecord.episode_interview_file_name === currentEpisodeName.current) {
            console.log('New record matches our current episode');
            
            // Mark that we've found a matching record
            foundMatchingRecord.current = true;
            
            // Update script links
            setScriptLinks({
              episode_interview_script_1: newRecord.episode_interview_script_1 || null,
              episode_interview_script_2: newRecord.episode_interview_script_2 || null,
              episode_interview_script_3: newRecord.episode_interview_script_3 || null,
              episode_interview_script_4: newRecord.episode_interview_script_4 || null,
              episode_interview_full_script: newRecord.episode_interview_full_script || null,
              episode_interview_file: newRecord.episode_interview_file || null
            });
            
            // Set script generated flag if any script exists
            const hasAnyScript = newRecord.episode_interview_script_1 || 
                                newRecord.episode_interview_script_2 || 
                                newRecord.episode_interview_script_3 || 
                                newRecord.episode_interview_script_4;
            
            setIsScriptGenerated(!!hasAnyScript);
            
            // Update script status if available
            if (newRecord.episode_interview_script_status) {
              setScriptStatus(newRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
            }
            
            // Update new status fields
            if (newRecord.episode_text_files_status) {
              setTextFilesStatus(newRecord.episode_text_files_status);
            }
            
            if (newRecord.podcast_status) {
              setPodcastStatus(newRecord.podcast_status);
            }
            
            // Check if Script #1 is available but not Script #4
            const hasScript1 = !!newRecord.episode_interview_script_1;
            const hasScript4 = !!newRecord.episode_interview_script_4;
            
            if (hasScript1 && !hasScript4) {
              // Keep the loading state active but update the processing status
              setProcessingStatus("Script #1 has been generated, kindly wait for the other scripts to load");
            } else if (hasScript4) {
              // Stop the loading state when all scripts are available
              setIsSubmitting(false);
              shouldClearPdfFile.current = true;
              
              // Clear the script4 check interval
              if (script4CheckIntervalRef.current !== null) {
                window.clearInterval(script4CheckIntervalRef.current);
                script4CheckIntervalRef.current = null;
              }
              
              // Clear the max wait timeout
              if (maxWaitTimeoutRef.current !== null) {
                window.clearTimeout(maxWaitTimeoutRef.current);
                maxWaitTimeoutRef.current = null;
              }
              
              // Show notification
              toast({
                title: "Success!",
                description: `Scripts for "${currentEpisodeName.current}" have been generated.`,
                variant: "default",
              });
            }
          }
        }
      })
      .subscribe();

    // Subscribe to UPDATE events
    const updateSubscription = supabase
      .channel('autoworkflow-updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'autoworkflow' 
      }, (payload) => {
        console.log('Record updated in Supabase:', payload);
        
        // Only process if we're currently submitting and have an episode name
        if (currentEpisodeName.current) {
          const updatedRecord = payload.new as any;
          
          // Check if this is the record for our current episode
          if (updatedRecord.episode_interview_file_name === currentEpisodeName.current) {
            console.log('Updated record matches our current episode');
            
            // Mark that we've found a matching record
            foundMatchingRecord.current = true;
            
            // Update script links
            setScriptLinks({
              episode_interview_script_1: updatedRecord.episode_interview_script_1 || null,
              episode_interview_script_2: updatedRecord.episode_interview_script_2 || null,
              episode_interview_script_3: updatedRecord.episode_interview_script_3 || null,
              episode_interview_script_4: updatedRecord.episode_interview_script_4 || null,
              episode_interview_full_script: updatedRecord.episode_interview_full_script || null,
              episode_interview_file: updatedRecord.episode_interview_file || null
            });
            
            // Set script generated flag if any script exists
            const hasAnyScript = updatedRecord.episode_interview_script_1 || 
                                updatedRecord.episode_interview_script_2 || 
                                updatedRecord.episode_interview_script_3 || 
                                updatedRecord.episode_interview_script_4;
            
            setIsScriptGenerated(!!hasAnyScript);
            
            // Update script status if available
            if (updatedRecord.episode_interview_script_status) {
              setScriptStatus(updatedRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
            }
            
            // Update new status fields
            if (updatedRecord.episode_text_files_status) {
              setTextFilesStatus(updatedRecord.episode_text_files_status);
            }
            
            if (updatedRecord.podcast_status) {
              setPodcastStatus(updatedRecord.podcast_status);
            }
            
            // Check if Script #1 is available but not Script #4
            const hasScript1 = !!updatedRecord.episode_interview_script_1;
            const hasScript4 = !!updatedRecord.episode_interview_script_4;
            
            if (hasScript1 && !hasScript4) {
              // Keep the loading state active but update the processing status
              setProcessingStatus("Script #1 has been generated, kindly wait for the other scripts to load");
            } else if (hasScript4 && isSubmitting) {
              // Stop the loading state when all scripts are available
              setIsSubmitting(false);
              shouldClearPdfFile.current = true;
              
              // Clear the script4 check interval
              if (script4CheckIntervalRef.current !== null) {
                window.clearInterval(script4CheckIntervalRef.current);
                script4CheckIntervalRef.current = null;
              }
              
              // Clear the max wait timeout
              if (maxWaitTimeoutRef.current !== null) {
                window.clearTimeout(maxWaitTimeoutRef.current);
                maxWaitTimeoutRef.current = null;
              }
              
              // Show notification
              toast({
                title: "Success!",
                description: `Scripts for "${currentEpisodeName.current}" have been generated.`,
                variant: "default",
              });
            }
          }
        }
      })
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      insertSubscription.unsubscribe();
      updateSubscription.unsubscribe();
      
      // Clear the script4 check interval if it exists
      if (script4CheckIntervalRef.current !== null) {
        window.clearInterval(script4CheckIntervalRef.current);
        script4CheckIntervalRef.current = null;
      }
      
      // Clear the max wait timeout if it exists
      if (maxWaitTimeoutRef.current !== null) {
        window.clearTimeout(maxWaitTimeoutRef.current);
        maxWaitTimeoutRef.current = null;
      }
    };
  }, [isSubmitting, toast]);

  // Process webhook response
  const processWebhookResponse = (data: any) => {
    console.log("Processing webhook response:", data);
    
    try {
      // Handle array response (from the webhook)
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        // Check if this is for our current episode
        if (item.episode_interview_file_name === currentEpisodeName.current) {
          // Mark that we've found a matching record
          foundMatchingRecord.current = true;
          
          // Update script links
          setScriptLinks({
            episode_interview_script_1: item.episode_interview_script_1 || null,
            episode_interview_script_2: item.episode_interview_script_2 || null,
            episode_interview_script_3: item.episode_interview_script_3 || null,
            episode_interview_script_4: item.episode_interview_script_4 || null,
            episode_interview_full_script: item.episode_interview_full_script || null,
            episode_interview_file: item.episode_interview_file || null
          });
          
          // Set script generated flag if any script exists
          const hasAnyScript = item.episode_interview_script_1 || 
                              item.episode_interview_script_2 || 
                              item.episode_interview_script_3 || 
                              item.episode_interview_script_4;
          
          setIsScriptGenerated(!!hasAnyScript);
          
          // Update script status if available
          if (item.episode_interview_script_status) {
            setScriptStatus(item.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
          }
          
          // Update new status fields
          if (item.episode_text_files_status) {
            setTextFilesStatus(item.episode_text_files_status);
          }
          
          if (item.podcast_status) {
            setPodcastStatus(item.podcast_status);
          }
          
          // Check if Script #1 is available but not Script #4
          const hasScript1 = !!item.episode_interview_script_1;
          const hasScript4 = !!item.episode_interview_script_4;
          
          if (hasScript1 && !hasScript4) {
            // Keep the loading state active but update the processing status
            setProcessingStatus("Script #1 has been generated, kindly wait for the other scripts to load");
          } else if (hasScript4) {
            // Stop the loading state when all scripts are available
            setIsSubmitting(false);
            shouldClearPdfFile.current = true;
          }
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error("Error processing webhook response:", error);
      return false;
    }
  };

  const onSubmit = async (data: FormValues) => {
    console.log("Form submitted");
    lastSubmittedData.current = data;
    
    // Store the current episode name for notifications
    currentEpisodeName.current = data.episodeName;
    
    // Reset the foundMatchingRecord flag
    foundMatchingRecord.current = false;
    
    // Set loading state
    setIsSubmitting(true);
    
    // Reset processing status
    setProcessingStatus(null);
    
    // Show processing toast with updated message about taking a few minutes
    toast({
      title: "Processing Started",
      description: "Your request is being processed. This will take a few minutes to complete.",
      variant: "default",
    });
    
    // Reset script links to null when starting a new submission
    setScriptLinks({
      episode_interview_script_1: null,
      episode_interview_script_2: null,
      episode_interview_script_3: null,
      episode_interview_script_4: null,
      episode_interview_full_script: null,
      episode_interview_file: null
    });
    setIsScriptGenerated(false);
    setTextFilesStatus(null);
    setPodcastStatus(null);
    
    // Create FormData
    const formData = new FormData();
    formData.append("episodeName", data.episodeName);
    formData.append("pdfFile", data.pdfFile);
    
    console.log("Submitting form to webhook");
    console.log("Episode name:", data.episodeName);
    console.log("PDF file name:", data.pdfFile.name);
    console.log("PDF file size:", data.pdfFile.size, "bytes");
    console.log("PDF file type:", data.pdfFile.type);
    
    // Set the submission timestamp
    submissionTimestamp.current = Date.now();
    console.log(`Setting submission timestamp: ${submissionTimestamp.current}`);
    
    // Reset the last check time
    lastCheckTime.current = 0;
    
    // Set up an interval to check for new rows every second
    if (script4CheckIntervalRef.current !== null) {
      window.clearInterval(script4CheckIntervalRef.current);
    }
    
    script4CheckIntervalRef.current = window.setInterval(() => {
      if (isSubmitting && !foundMatchingRecord.current) {
        checkForNewRow();
      } else {
        // Clear the interval if we're no longer submitting or found a match
        if (script4CheckIntervalRef.current !== null) {
          window.clearInterval(script4CheckIntervalRef.current);
          script4CheckIntervalRef.current = null;
        }
      }
    }, 1000); // Check every second
    
    // Set up a timeout to stop waiting after MAX_WAIT_TIME
    if (maxWaitTimeoutRef.current !== null) {
      window.clearTimeout(maxWaitTimeoutRef.current);
    }
    
    maxWaitTimeoutRef.current = window.setTimeout(() => {
      if (isSubmitting) {
        console.log(`Maximum wait time of ${MAX_WAIT_TIME}ms exceeded. Stopping loading state.`);
        
        // Stop the loading state
        setIsSubmitting(false);
        shouldClearPdfFile.current = true;
        
        // Clear the script4 check interval
        if (script4CheckIntervalRef.current !== null) {
          window.clearInterval(script4CheckIntervalRef.current);
          script4CheckIntervalRef.current = null;
        }
        
        // Show notification
        toast({
          title: "Processing Timeout",
          description: "The request is taking longer than expected. Please check the episodes list for your submission.",
          variant: "destructive",
        });
      }
    }, MAX_WAIT_TIME);
    
    // Check if there's already a record with this episode name
    try {
      const { data: existingData, error: existingError } = await supabase
        .from('autoworkflow')
        .select('id, created_at, episode_interview_script_1, episode_interview_script_2, episode_interview_script_3, episode_interview_script_4, episode_interview_full_script, episode_interview_file, episode_interview_script_status, episode_text_files_status, podcast_status')
        .eq('episode_interview_file_name', data.episodeName);
      
      if (existingError) {
        console.error('Error checking for existing records:', existingError);
      } else if (existingData && existingData.length > 0) {
        console.log('Found existing records with the same episode name:', existingData);
        
        // Sort by created_at to get the most recent record
        const sortedRecords = [...existingData].sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA; // Sort in descending order (newest first)
        });
        
        const mostRecentRecord = sortedRecords[0];
        
        // IMPORTANT: We're now stopping the loading state for ANY existing record with the matching episode name
        console.log('Using existing record:', mostRecentRecord);
        
        // Mark that we've found a matching record
        foundMatchingRecord.current = true;
        
        // Store the record ID
        currentEpisodeId.current = mostRecentRecord.id;
        
        // Update all script links
        setScriptLinks({
          episode_interview_script_1: mostRecentRecord.episode_interview_script_1 || null,
          episode_interview_script_2: mostRecentRecord.episode_interview_script_2 || null,
          episode_interview_script_3: mostRecentRecord.episode_interview_script_3 || null,
          episode_interview_script_4: mostRecentRecord.episode_interview_script_4 || null,
          episode_interview_full_script: mostRecentRecord.episode_interview_full_script || null,
          episode_interview_file: mostRecentRecord.episode_interview_file || null
        });
        
        // Stop the loading state
        setIsSubmitting(false);
        shouldClearPdfFile.current = true;
        
        // Clear the script4 check interval
        if (script4CheckIntervalRef.current !== null) {
          window.clearInterval(script4CheckIntervalRef.current);
          script4CheckIntervalRef.current = null;
        }
        
        // Clear the max wait timeout
        if (maxWaitTimeoutRef.current !== null) {
          window.clearTimeout(maxWaitTimeoutRef.current);
          maxWaitTimeoutRef.current = null;
        }
        
        // Set script generated flag if any script exists
        const hasAnyScript = mostRecentRecord.episode_interview_script_1 || 
                            mostRecentRecord.episode_interview_script_2 || 
                            mostRecentRecord.episode_interview_script_3 || 
                            mostRecentRecord.episode_interview_script_4;
        
        setIsScriptGenerated(!!hasAnyScript);
        
        // Update script status if available
        if (mostRecentRecord.episode_interview_script_status) {
          setScriptStatus(mostRecentRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
        }
        
        // Update new status fields
        if (mostRecentRecord.episode_text_files_status) {
          setTextFilesStatus(mostRecentRecord.episode_text_files_status);
        }
        
        if (mostRecentRecord.podcast_status) {
          setPodcastStatus(mostRecentRecord.podcast_status);
        }
        
        // Show notification
        toast({
          title: "Scripts Found!",
          description: `Existing scripts for "${data.episodeName}" have been loaded.`,
          variant: "default",
        });
        
        // Return early - no need to send the webhook request
        return;
      }
    } catch (err) {
      console.error('Error checking for existing records:', err);
    }
    
    // Send the webhook request
    try {
      // Webhook URL
      const webhookUrl = "https://d-launch.app.n8n.cloud/webhook-test/a662a23d-ca8c-499c-8524-a1292fb55950";
      
      // Use fetch with proper headers for binary file upload
      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
        // No need to set Content-Type header as it will be automatically set with the boundary
      });
      
      console.log("Webhook response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Could not read error response");
        console.error(`Server responded with status ${response.status}: ${response.statusText}. Details: ${errorText}`);
        
        // Just log the error - we'll continue waiting for new rows
        setLastError(`Error: Server responded with status ${response.status}`);
        setDetailedError(errorText);
      } else {
        // Try to parse the response as JSON
        try {
          const responseData = await response.json();
          console.log("Response data:", responseData);
          
          // Process the webhook response
          const processed = processWebhookResponse(responseData);
          
          // If we processed the response successfully, we can stop checking for new rows
          if (processed) {
            // Clear the script4 check interval
            if (script4CheckIntervalRef.current !== null) {
              window.clearInterval(script4CheckIntervalRef.current);
              script4CheckIntervalRef.current = null;
            }
            
            // Clear the max wait timeout
            if (maxWaitTimeoutRef.current !== null) {
              window.clearTimeout(maxWaitTimeoutRef.current);
              maxWaitTimeoutRef.current = null;
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
          setLastError("Error parsing response");
          setDetailedError(parseError instanceof Error ? parseError.message : "Unknown error");
        }
      }
      
      // Force an immediate check for new rows after webhook response
      checkForNewRow();
      
    } catch (error) {
      console.error("Error submitting form:", error);
      
      let errorMessage = "An error occurred while processing your request.";
      let detailedMsg = "";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        detailedMsg = `Error type: ${error.name}. Stack trace: ${error.stack || 'Not available'}`;
      }
      
      setLastError(`Error: ${errorMessage}`);
      setDetailedError(detailedMsg);
      
      // Log the error but don't show it to the user - we'll continue waiting for new rows
      console.error("Webhook error:", errorMessage);
      console.error("Detailed error:", detailedMsg);
      
      // Force an immediate check for new rows after error
      checkForNewRow();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setValue("pdfFile", file);
    }
  };

  const handleApproveScripts = () => {
    setIsApprovalDialogOpen(true);
  };

  const confirmApproval = async () => {
    setScriptStatus("Approved");
    setIsApprovalDialogOpen(false);
    
    // If we have a current episode ID, update the status in the database
    if (currentEpisodeId.current) {
      try {
        const { error } = await supabase
          .from('autoworkflow')
          .update({ 
            episode_interview_script_status: "Approved",
            episode_text_files_status: "Pending", // Set initial status for text files
            podcast_status: "Pending" // Set initial status for podcast
          })
          .eq('id', currentEpisodeId.current);
        
        if (error) {
          console.error('Error updating script status:', error);
          toast({
            title: "Update Error",
            description: "Failed to update script status in the database, but marked as approved locally.",
            variant: "destructive",
          });
        } else {
          // Update local state
          setTextFilesStatus("Pending");
          setPodcastStatus("Pending");
        }
      } catch (err) {
        console.error('Error updating script status:', err);
      }
    }
    
    toast({
      title: "Scripts Approved",
      description: "All scripts have been successfully approved. Audio generation has started.",
      variant: "default",
    });
  };

  const cancelApproval = () => {
    setIsApprovalDialogOpen(false);
  };

  // Function to refresh script links
  const refreshScriptLinks = async () => {
    if (!currentEpisodeName.current) return;
    
    setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase
        .from('autoworkflow')
        .select('id, episode_interview_script_1, episode_interview_script_2, episode_interview_script_3, episode_interview_script_4, episode_interview_full_script, episode_interview_file, episode_interview_script_status, episode_text_files_status, podcast_status')
        .eq('episode_interview_file_name', currentEpisodeName.current);
      
      if (error) {
        console.error('Error refreshing script links:', error);
        toast({
          title: "Refresh Error",
          description: "Failed to refresh script links.",
          variant: "destructive",
        });
        return;
      }
      
      if (data && data.length > 0) {
        // Sort by created_at to get the most recent record (if multiple exist)
        const mostRecentRecord = data[0];
        
        // Update script links
        setScriptLinks({
          episode_interview_script_1: mostRecentRecord.episode_interview_script_1 || null,
          episode_interview_script_2: mostRecentRecord.episode_interview_script_2 || null,
          episode_interview_script_3: mostRecentRecord.episode_interview_script_3 || null,
          episode_interview_script_4: mostRecentRecord.episode_interview_script_4 || null,
          episode_interview_full_script: mostRecentRecord.episode_interview_full_script || null,
          episode_interview_file: mostRecentRecord.episode_interview_file || null
        });
        
        // Update script status if available
        if (mostRecentRecord.episode_interview_script_status) {
          setScriptStatus(mostRecentRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
        }
        
        // Update new status fields
        if (mostRecentRecord.episode_text_files_status) {
          setTextFilesStatus(mostRecentRecord.episode_text_files_status);
        }
        
        if (mostRecentRecord.podcast_status) {
          setPodcastStatus(mostRecentRecord.podcast_status);
        }
        
        // Set script generated flag if any script exists
        const hasAnyScript = mostRecentRecord.episode_interview_script_1 || 
                            mostRecentRecord.episode_interview_script_2 || 
                            mostRecentRecord.episode_interview_script_3 || 
                            mostRecentRecord.episode_interview_script_4;
        
        setIsScriptGenerated(!!hasAnyScript);
        
        toast({
          title: "Scripts Refreshed",
          description: "Script links have been refreshed.",
          variant: "default",
        });
      }
    } catch (err) {
      console.error('Error in refreshScriptLinks:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check if we have a valid selected episode
  const hasValidSelectedEpisode = selectedEpisodeName && selectedEpisodeName.trim() !== '';

  // Render status badges for text files and podcast
  const renderStatusBadge = (status: string | null, type: string) => {
    if (!status) return null;
    
    let bgColor = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
    let icon = <AlertCircle className="w-3 h-3 mr-1" />;
    
    if (status === "Pending") {
      bgColor = "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100";
      icon = <AlertCircle className="w-3 h-3 mr-1" />;
    } else if (status === "Processing") {
      bgColor = "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
      icon = <Loader2 className="w-3 h-3 mr-1 animate-spin" />;
    } else if (status === "Completed") {
      bgColor = "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100";
      icon = <CheckCircle className="w-3 h-3 mr-1" />;
    } else if (status === "Failed") {
      bgColor = "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100";
      icon = <AlertCircle className="w-3 h-3 mr-1" />;
    }
    
    return (
      <div className="flex items-center mt-1">
        <span className="text-sm font-medium mr-2">{type}:</span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor}`}>
          {icon}
          {status}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Only show the viewing scripts header when a valid episode is selected */}
      {hasValidSelectedEpisode && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300">
            Viewing Scripts for: {selectedEpisodeName}
          </h3>
          <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
            You can view the scripts below or create a new episode using the form.
          </p>
        </div>
      )}

      {/* Show processing status banner when applicable */}
      {processingStatus && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            {processingStatus}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="episodeName">Episode Interview File Name</Label>
          <Input
            id="episodeName"
            placeholder="Enter episode name"
            {...register("episodeName")}
            disabled={isEpisodeSelected}
          />
          {errors.episodeName && (
            <p className="text-sm text-red-500">{errors.episodeName.message}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="pdfFile">Upload PDF</Label>
          <div className="flex items-center justify-center w-full">
            <label
              htmlFor="pdfFile"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg ${
                isEpisodeSelected 
                  ? 'cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700' 
                  : 'cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 border-gray-300 dark:border-gray-600'
              }`}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className={`w-8 h-8 mb-3 ${
                  isEpisodeSelected 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-500 dark:text-gray-400'
                }`} />
                <p className={`mb-2 text-sm ${
                  isEpisodeSelected 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className={`text-xs ${
                  isEpisodeSelected 
                    ? 'text-gray-400 dark:text-gray-500' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  PDF files only
                </p>
                {selectedFile && (
                  <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
                    {selectedFile.name}
                  </p>
                )}
              </div>
              <input
                id="pdfFile"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
                disabled={isEpisodeSelected}
                ref={fileInputRef}
              />
            </label>
          </div>
          {errors.pdfFile && (
            <p className="text-sm text-red-500">{errors.pdfFile.message}</p>
          )}
        </div>
        
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || isEpisodeSelected}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Script...
            </>
          ) : (
            "Generate Script"
          )}
        </Button>
      </form>

      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scripts and Audio</h3>
          <div className="flex items-center space-x-2">
            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshScriptLinks}
              disabled={isRefreshing || !currentEpisodeName.current}
              title="Refresh script links"
              className="mr-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Refresh</span>
            </Button>
            
            <div className="flex flex-col">
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">Script Status:</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  scriptStatus === "Approved" 
                    ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100" 
                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100"
                }`}>
                  {scriptStatus === "Approved" ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <AlertCircle className="w-3 h-3 mr-1" />
                  )}
                  {scriptStatus}
                </span>
              </div>
              
              {/* Show text files status if available */}
              {textFilesStatus && renderStatusBadge(textFilesStatus, "Text Files")}
              
              {/* Show podcast status if available */}
              {podcastStatus && renderStatusBadge(podcastStatus, "Podcast")}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <ul className="divide-y divide-gray-200 dark:divide-gray-600">
            {scriptTypes.map((script) => (
              <li key={script.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FileText className={`w-4 h-4 mr-2 ${
                      isScriptGenerated && isValidScriptLink(scriptLinks[script.responseKey])
                        ? "text-blue-600 dark:text-blue-400" 
                        : "text-gray-400 dark:text-gray-500"
                    }`} />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{script.name}</span>
                  </div>
                  {isScriptGenerated && isValidScriptLink(scriptLinks[script.responseKey]) ? (
                    <a 
                      href={scriptLinks[script.responseKey] || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {script.readOnly ? "View (Read Only)" : "View or Update"}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-400 dark:text-gray-500 cursor-not-allowed">
                      {script.readOnly ? "View (Read Only)" : "View or Update"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Button 
          onClick={handleApproveScripts}
          className="w-full"
          variant={scriptStatus === "Approved" ? "outline" : "default"}
          disabled={scriptStatus === "Approved" || !isScriptGenerated || !hasScript4}
          title={!hasScript4 ? "Script #4 - Summary is required for approval" : ""}
        >
          {scriptStatus === "Approved" 
            ? "Audio Generation In Progress" 
            : !hasScript4 && isScriptGenerated
              ? "Script #4 Required for Audio Generation"
              : "Generate Audio"}
        </Button>
      </div>

      <ScriptApprovalDialog 
        isOpen={isApprovalDialogOpen} 
        onConfirm={confirmApproval}
        onCancel={cancelApproval}
      />
    </>
  );
}
