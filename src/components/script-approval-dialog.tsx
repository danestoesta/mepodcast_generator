import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ScriptApprovalDialogProps {
  scriptLinks: {
    episode_interview_script_1: string | null;
    episode_interview_script_2: string | null;
    episode_interview_script_3: string | null;
    episode_interview_script_4: string | null;
    episode_interview_script_status?: string;
  };
  episodeName?: string;
  onApprove?: () => void;
}

export function ScriptApprovalDialog({ scriptLinks, episodeName, onApprove }: ScriptApprovalDialogProps) {
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
          {episodeName ? `Scripts for: ${episodeName}` : ''}
        </h2>
        {/* This is a placeholder for the h3 heading that's in the parent component */}
        {/* <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scripts</h3> */}
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        {!scriptLinks?.episode_interview_script_1 && 
         !scriptLinks?.episode_interview_script_2 && 
         !scriptLinks?.episode_interview_script_3 && 
         !scriptLinks?.episode_interview_script_4 ? (
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400">
              
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scriptLinks?.episode_interview_script_status && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Status: {scriptLinks.episode_interview_script_status}
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              {renderScriptLink(scriptLinks?.episode_interview_script_1, 1)}
              {renderScriptLink(scriptLinks?.episode_interview_script_2, 2)}
              {renderScriptLink(scriptLinks?.episode_interview_script_3, 3)}
              {renderScriptLink(scriptLinks?.episode_interview_script_4, 4)}
            </div>
          </div>
        )}
      </div>
      
      {onApprove && (
        <Button 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white" 
          onClick={onApprove}
        >
          Approve Scripts
        </Button>
      )}
    </div>
  );
}
