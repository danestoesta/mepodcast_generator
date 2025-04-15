import { useState } from "react";
import { PodcastForm } from "@/components/podcast-form";
import { EpisodesList } from "@/components/episodes-list";
import { Toaster } from "@/components/ui/toaster";
import { FileText, List } from "lucide-react";

// Define the interface for script links
interface ScriptLinks {
  episode_interview_script_1: string | null;
  episode_interview_script_2: string | null;
  episode_interview_script_3: string | null;
  episode_interview_script_4: string | null;
  episode_interview_full_script: string | null;
  episode_interview_file: string | null;
  episode_interview_script_status?: string;
}

function App() {
  // State to store selected script links
  const [selectedScriptLinks, setSelectedScriptLinks] = useState<ScriptLinks | null>(null);
  const [selectedEpisodeName, setSelectedEpisodeName] = useState<string | null>(null);

  // Handler for when a record is selected in the episodes list
  const handleRecordSelect = (
    scriptLinks: ScriptLinks, 
    episodeName: string | undefined
  ) => {
    // When deselecting (episodeName is undefined), set both states to null
    if (!episodeName) {
      setSelectedScriptLinks(null);
      setSelectedEpisodeName(null);
    } else {
      setSelectedScriptLinks(scriptLinks);
      setSelectedEpisodeName(episodeName);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <img 
              src="https://www.dropbox.com/scl/fi/t23dfvn2vuvdu6qzp2hpe/MEP-logo-icon-1.png?rlkey=poppf0so6zcu9j1dwfjkm4ln9&st=til8cctg&dl=1" 
              alt="Marketing Execution Podcast Logo" 
              className="h-10 w-10 mr-3" 
            />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Marketing Execution Podcast
            </h1>
          </div>
        </div>
      </header>
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 md:p-8">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Episode Interview Scripts and Audio Generator
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                  Upload your PDF and get a professionally generated podcast script in minutes.
                </p>
              </div>
              
              <PodcastForm 
                selectedScriptLinks={selectedScriptLinks}
                selectedEpisodeName={selectedEpisodeName}
              />
            </div>
            
            {/* Episodes List Section */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 md:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  <List className="w-5 h-5 mr-2" />
                  Episodes List
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                  View all your podcast episodes and their generated scripts.
                </p>
              </div>
              
              <div className="overflow-y-auto max-h-[800px] pr-2">
                <EpisodesList onRecordSelect={handleRecordSelect} />
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} Marketing Execution Podcast. All rights reserved.
          </p>
        </div>
      </footer>
      
      <Toaster />
    </div>
  );
}

export default App;
