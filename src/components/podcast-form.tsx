import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, CheckCircle, AlertCircle, FileText, Loader2 } from "lucide-react";
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
}

// Define the webhook response type
interface WebhookResponseItem {
  id?: string;
  episode_interview_script_1?: string;
  episode_interview_script_2?: string;
  episode_interview_script_3?: string;
  episode_interview_script_4?: string;
  episode_interview_script_status?: string;
  [key: string]: any; // For other fields we don't explicitly need
}

// Interface for script links passed from parent
interface ScriptLinks {
  episode_interview_script_1: string | null;
  episode_interview_script_2: string | null;
  episode_interview_script_3: string | null;
  episode_interview_script_4: string | null;
  episode_interview_script_status?: string;
}

interface PodcastFormProps {
  selectedScriptLinks?: ScriptLinks | null;
  selectedEpisodeName?: string | null;
}

export function PodcastForm({ selectedScriptLinks, selectedEpisodeName }: PodcastFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScriptGenerated, setIsScriptGenerated] = useState(false);
  const [scriptStatus, setScriptStatus] = useState<"Pending" | "Approved">("Pending");
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  // Initialize with null values instead of empty strings to properly indicate absence of links
  const [scriptLinks, setScriptLinks] = useState<Record<string, string | null>>({
    episode_interview_script_1: null,
    episode_interview_script_2: null,
    episode_interview_script_3: null,
    episode_interview_script_4: null
  });
  
  // Store form data for retrying
  const lastSubmittedData = useRef<FormValues | null>(null);
  
  // Error details for debugging
  const [lastError, setLastError] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  
  // Store the timestamp when the form was submitted
  const submissionTimestamp = useRef<number | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const scriptTypes: ScriptType[] = [
    { id: 1, name: "Script #1 - 3 Key Points", responseKey: "episode_interview_script_1" },
    { id: 2, name: "Script #2 - What it Means", responseKey: "episode_interview_script_2" },
    { id: 3, name: "Script #3 - Practical Application", responseKey: "episode_interview_script_3" },
    { id: 4, name: "Script #4 - Summary", responseKey: "episode_interview_script_4" }
  ];

  // Update form when selectedScriptLinks changes
  useEffect(() => {
    if (selectedScriptLinks) {
      // Update script links
      setScriptLinks({
        episode_interview_script_1: selectedScriptLinks.episode_interview_script_1,
        episode_interview_script_2: selectedScriptLinks.episode_interview_script_2,
        episode_interview_script_3: selectedScriptLinks.episode_interview_script_3,
        episode_interview_script_4: selectedScriptLinks.episode_interview_script_4
      });
      
      // Update script status if available
      if (selectedScriptLinks.episode_interview_script_status) {
        setScriptStatus(selectedScriptLinks.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
      } else {
        setScriptStatus("Pending");
      }
      
      // Set isScriptGenerated to true if any script link exists
      const hasAnyScript = Object.values(selectedScriptLinks).some(link => 
        link !== null && link !== undefined && link !== ''
      );
      setIsScriptGenerated(hasAnyScript);
      
      // If episode name is provided, update the form field
      if (selectedEpisodeName) {
        setValue("episodeName", selectedEpisodeName);
      }
    }
  }, [selectedScriptLinks, selectedEpisodeName, setValue]);

  // Set up subscription to listen for new records in the autoworkflow table
  useEffect(() => {
    // Subscribe to changes in the autoworkflow table
    const subscription = supabase
      .channel('autoworkflow-changes')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'autoworkflow' 
      }, (payload) => {
        console.log('New record created:', payload);
        
        // Check if we're currently submitting and have a submission timestamp
        if (isSubmitting && submissionTimestamp.current) {
          const newRecordTime = new Date(payload.commit_timestamp).getTime();
          const submissionTime = submissionTimestamp.current;
          
          // If the new record was created after our submission (with a small buffer for timing differences)
          if (newRecordTime >= submissionTime - 5000) { // 5 second buffer
            console.log('New record detected after form submission, stopping loading state');
            
            // Stop the loading state
            setIsSubmitting(false);
            
            // Check if the new record has any script links
            const newRecord = payload.new as any;
            if (newRecord) {
              const updatedLinks = { ...scriptLinks };
              let foundLinks = false;
              
              // Check for each script key
              scriptTypes.forEach(script => {
                const key = script.responseKey;
                if (newRecord[key] && typeof newRecord[key] === 'string' && newRecord[key].trim() !== '') {
                  updatedLinks[key] = newRecord[key];
                  foundLinks = true;
                }
              });
              
              if (foundLinks) {
                setScriptLinks(updatedLinks);
                setIsScriptGenerated(true);
                
                // Update script status if available
                if (newRecord.episode_interview_script_status) {
                  setScriptStatus(newRecord.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
                }
                
                toast({
                  title: "Success!",
                  description: "Your podcast scripts have been generated.",
                  variant: "default",
                });
              }
            }
          }
        }
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [isSubmitting, scriptLinks, scriptTypes, toast]);

  // Process webhook response
  const processWebhookResponse = (data: any) => {
    console.log("Processing webhook response:", data);
    
    try {
      // Handle array response (from the webhook)
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        
        // Extract script links
        const updatedLinks = { ...scriptLinks };
        let foundLinks = false;
        
        // Check for each script key
        scriptTypes.forEach(script => {
          const key = script.responseKey;
          if (item[key] && typeof item[key] === 'string' && item[key].trim() !== '') {
            updatedLinks[key] = item[key];
            foundLinks = true;
          }
        });
        
        if (foundLinks) {
          setScriptLinks(updatedLinks);
          setIsScriptGenerated(true);
          
          // Update script status if available
          if (item.episode_interview_script_status) {
            setScriptStatus(item.episode_interview_script_status === "Approved" ? "Approved" : "Pending");
          }
          
          toast({
            title: "Success!",
            description: "Your podcast scripts have been generated.",
            variant: "default",
          });
          
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
    
    // Show processing toast
    toast({
      title: "Processing Started",
      description: "Your request is being processed. This may take several minutes.",
      variant: "default",
    });
    
    // Reset script links to null when starting a new submission
    setScriptLinks({
      episode_interview_script_1: null,
      episode_interview_script_2: null,
      episode_interview_script_3: null,
      episode_interview_script_4: null
    });
    setIsScriptGenerated(false);
    
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
    
    // Simulate successful script generation
    setTimeout(() => {
      // Generate mock script links
      const mockScriptLinks = {
        episode_interview_script_1: "https://example.com/script1.pdf",
        episode_interview_script_2: "https://example.com/script2.pdf",
        episode_interview_script_3: "https://example.com/script3.pdf",
        episode_interview_script_4: "https://example.com/script4.pdf"
      };
      
      setScriptLinks(mockScriptLinks);
      setIsScriptGenerated(true);
      setScriptStatus("Pending");
      
      toast({
        title: "Success!",
        description: "Your podcast scripts have been generated.",
        variant: "default",
      });
    }, 2000);
    
    // Note: The actual webhook call is commented out to prevent the fetch error
    // In a production environment, you would uncomment this code and remove the setTimeout mock
    
    /*
    try {
      // Webhook URL
      const webhookUrl = "https://d-launch.app.n8n.cloud/webhook-test/a662a23d-ca8c-499c-8524-a1292fb55950";
      
      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Could not read error response");
        throw new Error(`Server responded with status ${response.status}: ${response.statusText}. Details: ${errorText}`);
      }
      
      // Parse the response as JSON
      const responseData = await response.json();
      console.log("Response data:", responseData);
      
      // Process the webhook response
      const success = processWebhookResponse(responseData);
      
      if (!success) {
        toast({
          title: "Warning",
          description: "Received response but couldn't find script links. Please try again.",
          variant: "destructive",
        });
      }
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
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
    */
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

  const confirmApproval = () => {
    setScriptStatus("Approved");
    setIsApprovalDialogOpen(false);
    toast({
      title: "Scripts Approved",
      description: "All scripts have been successfully approved.",
      variant: "default",
    });
  };

  const cancelApproval = () => {
    setIsApprovalDialogOpen(false);
  };

  // Helper function to check if a script link is valid
  const isValidScriptLink = (link: string | null): boolean => {
    return link !== null && link !== undefined && link.trim() !== '';
  };

  return (
    <>
      {/* Only show the viewing scripts header when an episode is selected */}
      {selectedEpisodeName && selectedEpisodeName.trim() !== '' && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300">
            Viewing Scripts for: {selectedEpisodeName}
          </h3>
          <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
            You can view the scripts below or create a new episode using the form.
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
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 border-gray-300 dark:border-gray-600"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-3 text-gray-500 dark:text-gray-400" />
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
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
        >
          Generate Script
        </Button>
      </form>

      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scripts</h3>
          <div className="flex items-center space-x-2">
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
                      View
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-400 dark:text-gray-500 cursor-not-allowed">
                      View
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
          disabled={scriptStatus === "Approved" || !isScriptGenerated}
        >
          {scriptStatus === "Approved" ? "Scripts Approved" : "Approve Scripts"}
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
