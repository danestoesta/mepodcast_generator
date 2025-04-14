import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Edit, Trash2, Save, X, RefreshCw, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

// Interface representing the exact columns in the autoworkflow table
interface AutoworkflowRecord {
  id: string;
  episode_number?: string;
  source_document_file_name?: string;
  source_document?: string;
  episode_interview_file_name?: string;
  episode_interview_file?: string;
  episode_interview_full_script?: string;
  episode_interview_script_1?: string;
  episode_interview_script_2?: string;
  episode_interview_script_3?: string;
  episode_interview_script_4?: string;
  episode_titles?: string;
  episode_description?: string;
  episode_intro_transcript?: string;
  linkedin_post_copy?: string;
  x_post_copy?: string;
  podcast_excerpt?: string;
  show_notes?: string;
  episode_intro_audio_file?: string;
  master_audio_file?: string;
  episode_cover_art?: string;
  scheduled_date?: string;
  unix_timestamp?: number;
  publish_date?: string;
  publish_time?: string;
  episode_interview_script_status?: string;
}

// Interface for script links to be passed to parent component
interface ScriptLinks {
  episode_interview_script_1: string | null;
  episode_interview_script_2: string | null;
  episode_interview_script_3: string | null;
  episode_interview_script_4: string | null;
  episode_interview_script_status?: string;
}

// Props for the EpisodesList component
interface EpisodesListProps {
  onRecordSelect?: (scriptLinks: ScriptLinks, episodeName: string | undefined) => void;
}

// Helper to check if a string is a valid URL
const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Render cell content with clickable links if applicable
const CellContent = ({ value }: { value: string | number | null | undefined }) => {
  if (value === null || value === undefined) return <span>null</span>;
  
  const stringValue = String(value);
  
  if (isValidUrl(stringValue)) {
    return (
      <a 
        href={stringValue} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
      >
        {stringValue.length > 40 ? `${stringValue.substring(0, 40)}...` : stringValue}
        <ExternalLink className="h-3 w-3 ml-1 inline" />
      </a>
    );
  }
  
  return <span>{typeof value === 'object' ? JSON.stringify(value) : stringValue}</span>;
};

export function EpisodesList({ onRecordSelect }: EpisodesListProps) {
  const [records, setRecords] = useState<AutoworkflowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedRecord, setEditedRecord] = useState<AutoworkflowRecord | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch records from Supabase
  const fetchRecords = async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      
      const { data, error } = await supabase
        .from('autoworkflow')
        .select('*');
      
      if (error) {
        throw new Error(error.message);
      }
      
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching records:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch records');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Set up real-time subscription
  useEffect(() => {
    fetchRecords();

    // Subscribe to changes
    const subscription = supabase
      .channel('autoworkflow-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'autoworkflow' 
      }, (payload) => {
        console.log('Change received!', payload);
        fetchRecords(false);
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Manual refresh function
  const handleRefresh = () => {
    fetchRecords(false);
  };

  // Start editing a record
  const handleEdit = (record: AutoworkflowRecord) => {
    setEditingId(record.id);
    setEditedRecord({ ...record });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditedRecord(null);
  };

  // Handle input change for editing
  const handleEditChange = (key: keyof AutoworkflowRecord, value: string) => {
    if (editedRecord) {
      setEditedRecord({
        ...editedRecord,
        [key]: value
      });
    }
  };

  // Save edited record to Supabase
  const handleSaveEdit = async () => {
    if (!editedRecord) return;
    
    try {
      const { error } = await supabase
        .from('autoworkflow')
        .update(editedRecord)
        .eq('id', editedRecord.id);
      
      if (error) throw new Error(error.message);
      
      // Update local state
      setRecords(records.map(record => 
        record.id === editedRecord.id ? editedRecord : record
      ));
      
      setEditingId(null);
      setEditedRecord(null);
      
      toast({
        title: "Record updated",
        description: "The record has been successfully updated.",
      });
    } catch (err) {
      console.error('Error updating record:', err);
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Failed to update record",
        variant: "destructive",
      });
    }
  };

  // Delete a record from Supabase
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('autoworkflow')
        .delete()
        .eq('id', id);
      
      if (error) throw new Error(error.message);
      
      // Update local state
      setRecords(records.filter(record => record.id !== id));
      
      // If the deleted record was selected, clear the selection
      if (selectedRecordId === id) {
        setSelectedRecordId(null);
        if (onRecordSelect) {
          onRecordSelect({
            episode_interview_script_1: null,
            episode_interview_script_2: null,
            episode_interview_script_3: null,
            episode_interview_script_4: null,
            episode_interview_script_status: undefined
          }, undefined);
        }
      }
      
      toast({
        title: "Record deleted",
        description: "The record has been successfully deleted.",
      });
    } catch (err) {
      console.error('Error deleting record:', err);
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete record",
        variant: "destructive",
      });
    }
  };

  // Handle selecting or unselecting a record to view its scripts
  const handleViewScripts = (record: AutoworkflowRecord) => {
    // If the record is already selected, unselect it
    if (selectedRecordId === record.id) {
      setSelectedRecordId(null);
      
      if (onRecordSelect) {
        onRecordSelect({
          episode_interview_script_1: null,
          episode_interview_script_2: null,
          episode_interview_script_3: null,
          episode_interview_script_4: null,
          episode_interview_script_status: undefined
        }, undefined);
      }
      
      toast({
        title: "Selection Cleared",
        description: "Episode selection has been cleared.",
      });
    } else {
      // Otherwise, select the record
      setSelectedRecordId(record.id);
      
      if (onRecordSelect) {
        onRecordSelect({
          episode_interview_script_1: record.episode_interview_script_1 || null,
          episode_interview_script_2: record.episode_interview_script_2 || null,
          episode_interview_script_3: record.episode_interview_script_3 || null,
          episode_interview_script_4: record.episode_interview_script_4 || null,
          episode_interview_script_status: record.episode_interview_script_status
        }, record.episode_interview_file_name);
      }
      
      toast({
        title: "Scripts Loaded",
        description: `Loaded scripts for ${record.episode_interview_file_name || 'Unnamed Episode'}`,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Loading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 my-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error loading data</h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => fetchRecords()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Display when no records are found
  if (records.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No records found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            The autoworkflow table is currently empty.
          </p>
        </div>
      </div>
    );
  }

  // Render the table with records
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Episodes List</h2>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
              {Object.keys(records[0]).map((column) => (
                <th 
                  key={column}
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {records.map((record) => (
              <tr 
                key={record.id}
                className={selectedRecordId === record.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex space-x-2">
                    {editingId === record.id ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleSaveEdit}
                          className="p-1 h-8 w-8"
                          title="Save"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleCancelEdit}
                          className="p-1 h-8 w-8"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewScripts(record)}
                          className={`p-1 h-8 w-8 ${selectedRecordId === record.id ? 'bg-blue-100 dark:bg-blue-800' : ''}`}
                          title={selectedRecordId === record.id ? "Unselect" : "View Scripts"}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEdit(record)}
                          className="p-1 h-8 w-8"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleDelete(record.id)}
                          className="p-1 h-8 w-8 text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
                {Object.entries(record).map(([key, value]) => (
                  <td 
                    key={`${record.id}-${key}`} 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis max-w-xs"
                  >
                    {editingId === record.id && editedRecord ? (
                      <Input
                        value={editedRecord[key as keyof AutoworkflowRecord] || ''}
                        onChange={(e) => handleEditChange(key as keyof AutoworkflowRecord, e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      <CellContent value={value} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
