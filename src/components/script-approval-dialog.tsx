import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface ScriptApprovalDialogProps {
  scriptLinks?: {
    episode_interview_script_1: string | null;
    episode_interview_script_2: string | null;
    episode_interview_script_3: string | null;
    episode_interview_script_4: string | null;
    episode_interview_full_script?: string | null;
    episode_interview_file?: string | null;
    episode_interview_script_status?: string;
    episode_text_files_status?: string; // New column
    podcast_status?: string; // New column
  };
  episodeName?: string;
  onApprove?: () => void;
  isOpen?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ScriptApprovalDialog({ 
  scriptLinks, 
  episodeName, 
  onApprove,
  isOpen,
  onConfirm,
  onCancel
}: ScriptApprovalDialogProps) {
  // Local state to track the latest script links
  const [currentScriptLinks, setCurrentScriptLinks] = useState(scriptLinks);
  
  // Set up automatic refresh every second
  useEffect(() => {
    // Function to trigger refresh event
    const triggerRefresh = () => {
      // Dispatch event to notify EpisodesList to refresh
      window.dispatchEvent(new CustomEvent('episodes-list-auto-refresh'));
    };

    // Set up interval for automatic refresh
    const refreshInterval = setInterval(triggerRefresh, 1000);

    // Clean up interval on component unmount
    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  // Effect to update script links when props change or when actively monitoring a file
  useEffect(() => {
    // If we have an episode name, set up real-time monitoring for this specific episode
    if (episodeName) {
      const fetchLatestScriptLinks = async () => {
        try {
          const { data, error } = await supabase
            .from('autoworkflow')
            .select('episode_interview_script_1, episode_interview_script_2, episode_interview_script_3, episode_interview_script_4, episode_interview_full_script, episode_interview_file, episode_interview_script_status, episode_text_files_status, podcast_status')
            .eq('episode_interview_file_name', episodeName)
            .single();
          
          if (error) {
            console.error('Error fetching latest script links:', error);
            return;
          }
          
          if (data) {
            // Only update if there's actual data to update with
            setCurrentScriptLinks(prevLinks => {
              // Create a new object with updated values
              const updatedLinks = { ...prevLinks };
              
              // Update each script link only if it exists in the data
              if (data.episode_interview_script_1 !== null) {
                updatedLinks.episode_interview_script_1 = data.episode_interview_script_1;
              }
              
              if (data.episode_interview_script_2 !== null) {
                updatedLinks.episode_interview_script_2 = data.episode_interview_script_2;
              }
              
              if (data.episode_interview_script_3 !== null) {
                updatedLinks.episode_interview_script_3 = data.episode_interview_script_3;
              }
              
              if (data.episode_interview_script_4 !== null) {
                updatedLinks.episode_interview_script_4 = data.episode_interview_script_4;
              }
              
              if (data.episode_interview_full_script !== null) {
                updatedLinks.episode_interview_full_script = data.episode_interview_full_script;
              }
              
              if (data.episode_interview_file !== null) {
                updatedLinks.episode_interview_file = data.episode_interview_file;
              }
              
              // Always update status if it exists
              if (data.episode_interview_script_status) {
                updatedLinks.episode_interview_script_status = data.episode_interview_script_status;
              }
              
              // Update new status fields
              if (data.episode_text_files_status) {
                updatedLinks.episode_text_files_status = data.episode_text_files_status;
              }
              
              if (data.podcast_status) {
                updatedLinks.podcast_status = data.podcast_status;
              }
              
              return updatedLinks;
            });
          }
        } catch (err) {
          console.error('Error in script links refresh:', err);
        }
      };
      
      // Initial fetch
      fetchLatestScriptLinks();
      
      // Set up interval to check for updates more frequently (every 500ms)
      const scriptUpdateInterval = setInterval(fetchLatestScriptLinks, 500);
      
      // Clean up
      return () => {
        clearInterval(scriptUpdateInterval);
      };
    } else {
      // If no episode is selected, just use the props
      setCurrentScriptLinks(scriptLinks);
    }
  }, [episodeName]);

  // Update local state when props change (initial selection)
  useEffect(() => {
    // Only update from props when episode changes or on initial load
    if (!episodeName || Object.values(currentScriptLinks || {}).every(val => val === null)) {
      setCurrentScriptLinks(scriptLinks);
    }
  }, [scriptLinks, episodeName]);

  // Helper function to render script links
  const renderScriptLink = (url: string | null, index: number) => {
    if (!url) return <p className="text-gray-500 dark:text-gray-400">No script available</p>;
    
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
      >
        Script {index} {url.includes('approved') ? '(Approved)' : ''}
      </a>
    );
  };

  // Render status badges for text files and podcast
  const renderStatusBadge = (status: string | null | undefined, label: string) => {
    if (!status) return null;
    
    let badgeClass = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    
    if (status === "Pending") {
      badgeClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-300";
    } else if (status === "Processing") {
      badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-300";
    } else if (status === "Completed") {
      badgeClass = "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-300";
    } else if (status === "Failed") {
      badgeClass = "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-300";
    }
    
    return (
      <div className="mt-1">
        <span className="text-sm">{label}: </span>
        <span className={`inline-block px-2 py-1 text-xs rounded ${badgeClass}`}>
          {status}
        </span>
      </div>
    );
  };

  // If this is a modal dialog
  if (isOpen) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4">Generate Audio</h2>
          <p className="mb-6">Are you sure you want to generate audio for this episode? This will mark the scripts as approved and start the audio generation process.</p>
          
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onConfirm}>
              Generate Audio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
          {episodeName ? `Scripts for: ${episodeName}` : ''}
        </h2>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        {!currentScriptLinks?.episode_interview_script_1 && 
         !currentScriptLinks?.episode_interview_script_2 && 
         !currentScriptLinks?.episode_interview_script_3 && 
         !currentScriptLinks?.episode_interview_script_4 ? (
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400">
              
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentScriptLinks?.episode_interview_script_status && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Script Status: {currentScriptLinks.episode_interview_script_status}
                </p>
                
                {/* Display text files status */}
                {renderStatusBadge(currentScriptLinks.episode_text_files_status, "Text Files Status")}
                
                {/* Display podcast status */}
                {renderStatusBadge(currentScriptLinks.podcast_status, "Podcast Status")}
              </div>
            )}
            
            <div className="space-y-2">
              {renderScriptLink(currentScriptLinks?.episode_interview_script_1, 1)}
              {renderScriptLink(currentScriptLinks?.episode_interview_script_2, 2)}
              {renderScriptLink(currentScriptLinks?.episode_interview_script_3, 3)}
              {renderScriptLink(currentScriptLinks?.episode_interview_script_4, 4)}
            </div>
          </div>
        )}
      </div>
      
      {onApprove && (
        <Button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white" 
          onClick={onApprove}
        >
          Generate Audio
        </Button>
      )}
    </div>
  );
}
