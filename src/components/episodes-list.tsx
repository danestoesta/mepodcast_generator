import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Edit, Trash2, Save, X, ExternalLink, Eye, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

// Interface representing the exact columns in the autoworkflow table
interface AutoworkflowRecord {
  id: string;
  created_at?: string;
  episode_text_files_status?: string; // New column
  podcast_status?: string; // New column
  [key: string]: any; // Allow for dynamic columns
}

// Interface for script links to be passed to parent component
interface ScriptLinks {
  episode_interview_script_1: string | null;
  episode_interview_script_2: string | null;
  episode_interview_script_3: string | null;
  episode_interview_script_4: string | null;
  episode_interview_full_script: string | null;
  episode_interview_file: string | null;
  episode_interview_script_status?: string;
  episode_text_files_status?: string; // New column
  podcast_status?: string; // New column
}

// Props for the EpisodesList component
interface EpisodesListProps {
  onRecordSelect?: (scriptLinks: ScriptLinks, episodeName: string | undefined) => void;
}

// Sort direction type
type SortDirection = 'asc' | 'desc' | null;

// Sort state interface
interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Predefined column order - moved created_at to the first position
const PREDEFINED_COLUMN_ORDER = [
  'created_at',
  'episode_interview_file_name',
  'episode_interview_file',
  'id',
  'episode_number',
  'source_document_file_name',
  'source_document',
  'episode_interview_full_script',
  'episode_interview_script_1',
  'episode_interview_script_2',
  'episode_interview_script_3',
  'episode_interview_script_4',
  'episode_interview_script_status',
  'episode_text_files_status', // New column
  'podcast_status', // New column
  'episode_titles',
  'episode_description',
  'episode_intro_transcript',
  'linkedin_post_copy',
  'x_post_copy',
  'podcast_excerpt',
  'show_notes',
  'episode_intro_audio_file',
  'master_audio_file',
  'episode_cover_art',
  'scheduled_date',
  'unix_timestamp',
  'publish_date',
  'publish_time'
];

// Helper to check if a string is a valid URL
const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Format date for display
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch (e) {
    return dateString || '';
  }
};

// Render cell content with clickable links if applicable
const CellContent = ({ value, column }: { value: string | number | null | undefined, column: string }) => {
  if (value === null || value === undefined) return <span>null</span>;
  
  // Format date for created_at column
  if (column === 'created_at') {
    return <span>{formatDate(String(value))}</span>;
  }
  
  const stringValue = String(value);
  
  if (isValidUrl(stringValue)) {
    return (
      <a 
        href={stringValue} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
        onClick={(e) => e.stopPropagation()} // Prevent row click when clicking the link
      >
        {stringValue.length > 40 ? `${stringValue.substring(0, 40)}...` : stringValue}
        <ExternalLink className="h-3 w-3 ml-1 inline" />
      </a>
    );
  }
  
  return <span>{typeof value === 'object' ? JSON.stringify(value) : stringValue}</span>;
};

// Compare function for sorting
const compareValues = (a: any, b: any, isAsc: boolean = true): number => {
  // Handle null/undefined values
  if (a === null || a === undefined) return isAsc ? -1 : 1;
  if (b === null || b === undefined) return isAsc ? 1 : -1;
  
  // Handle numbers
  if (!isNaN(Number(a)) && !isNaN(Number(b))) {
    return isAsc ? Number(a) - Number(b) : Number(b) - Number(a);
  }
  
  // Handle dates
  const dateA = new Date(a);
  const dateB = new Date(b);
  if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
    return isAsc ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
  }
  
  // Handle strings
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
};

export function EpisodesList({ onRecordSelect }: EpisodesListProps) {
  const [records, setRecords] = useState<AutoworkflowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedRecord, setEditedRecord] = useState<AutoworkflowRecord | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const { toast } = useToast();

  // Fetch data from Supabase
  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      
      // Fetch the records first
      const { data, error } = await supabase
        .from('autoworkflow')
        .select('*');
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Set the records
      setRecords(data || []);
      
      // If we have records, extract available columns
      if (data && data.length > 0) {
        // Get all columns from the first record
        const allColumns = Object.keys(data[0]);
        setAvailableColumns(allColumns);
      }
      
      // Dispatch a custom event to notify other components that refresh was clicked
      window.dispatchEvent(new CustomEvent('episodes-list-refresh'));
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Set up real-time subscription and auto-refresh
  useEffect(() => {
    // Initial data fetch
    fetchData();

    // Subscribe to changes
    const subscription = supabase
      .channel('autoworkflow-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'autoworkflow' 
      }, (payload) => {
        console.log('Change received!', payload);
        fetchData(false);
      })
      .subscribe();

    // Listen for auto-refresh events from PodcastForm
    const handleAutoRefresh = () => {
      fetchData(false);
    };

    // Add event listener for auto-refresh
    window.addEventListener('episodes-list-auto-refresh', handleAutoRefresh);

    // Cleanup subscription and event listener on unmount
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('episodes-list-auto-refresh', handleAutoRefresh);
    };
  }, []);

  // Start editing a record
  const handleEdit = (record: AutoworkflowRecord, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking edit button
    setEditingId(record.id);
    setEditedRecord({ ...record });
  };

  // Cancel editing
  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking cancel button
    setEditingId(null);
    setEditedRecord(null);
  };

  // Handle input change for editing
  const handleEditChange = (key: string, value: string) => {
    if (editedRecord) {
      setEditedRecord({
        ...editedRecord,
        [key]: value
      });
    }
  };

  // Save edited record to Supabase
  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking save button
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
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking delete button
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
            episode_interview_full_script: null,
            episode_interview_file: null,
            episode_interview_script_status: undefined,
            episode_text_files_status: undefined, // New column
            podcast_status: undefined // New column
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
  const handleViewScripts = (record: AutoworkflowRecord, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking view button
    selectRecord(record);
  };

  // Handle row click to select a record
  const handleRowClick = (record: AutoworkflowRecord) => {
    // Don't do anything if we're currently editing
    if (editingId === record.id) return;
    
    selectRecord(record);
  };

  // Common function to select a record
  const selectRecord = (record: AutoworkflowRecord) => {
    // If the record is already selected, unselect it
    if (selectedRecordId === record.id) {
      setSelectedRecordId(null);
      
      if (onRecordSelect) {
        onRecordSelect({
          episode_interview_script_1: null,
          episode_interview_script_2: null,
          episode_interview_script_3: null,
          episode_interview_script_4: null,
          episode_interview_full_script: null,
          episode_interview_file: null,
          episode_interview_script_status: undefined,
          episode_text_files_status: undefined, // New column
          podcast_status: undefined // New column
        }, undefined);
      }
    } else {
      // Otherwise, select the record
      setSelectedRecordId(record.id);
      
      if (onRecordSelect) {
        onRecordSelect({
          episode_interview_script_1: record.episode_interview_script_1 || null,
          episode_interview_script_2: record.episode_interview_script_2 || null,
          episode_interview_script_3: record.episode_interview_script_3 || null,
          episode_interview_script_4: record.episode_interview_script_4 || null,
          episode_interview_full_script: record.episode_interview_full_script || null,
          episode_interview_file: record.episode_interview_file || null,
          episode_interview_script_status: record.episode_interview_script_status,
          episode_text_files_status: record.episode_text_files_status, // New column
          podcast_status: record.podcast_status // New column
        }, record.episode_interview_file_name);
      }
    }
  };

  // Handle column sort
  const handleSort = (column: string) => {
    setSortState(prevState => {
      // If clicking on the same column, cycle through sort directions: null -> asc -> desc -> null
      if (prevState.column === column) {
        if (prevState.direction === null) return { column, direction: 'asc' };
        if (prevState.direction === 'asc') return { column, direction: 'desc' };
        return { column: null, direction: null }; // Reset sort
      }
      // If clicking on a different column, start with ascending sort
      return { column, direction: 'asc' };
    });
  };

  // Get ordered columns based on the predefined order and available columns
  const orderedColumns = useMemo(() => {
    if (records.length === 0) return [];
    
    // Filter the predefined column order to only include columns that exist in the data
    const filteredColumns = PREDEFINED_COLUMN_ORDER.filter(col => 
      availableColumns.includes(col)
    );
    
    // Add any columns that exist in the data but aren't in the predefined order
    const remainingColumns = availableColumns.filter(col => 
      !PREDEFINED_COLUMN_ORDER.includes(col)
    ).sort();
    
    return [...filteredColumns, ...remainingColumns];
  }, [records, availableColumns]);

  // Sort records based on current sort state
  const sortedRecords = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return records;
    }
    
    return [...records].sort((a, b) => {
      return compareValues(a[sortState.column!], b[sortState.column!], sortState.direction === 'asc');
    });
  }, [records, sortState]);

  // Render sort indicator
  const renderSortIndicator = (column: string) => {
    if (sortState.column !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />;
    }
    
    if (sortState.direction === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1 inline" />;
    }
    
    if (sortState.direction === 'desc') {
      return <ArrowDown className="h-3 w-3 ml-1 inline" />;
    }
    
    return null;
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
              onClick={() => fetchData()}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Episodes list is updated automatically
          </p>
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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Episodes list is updated automatically
        </p>
      </div>
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
              {orderedColumns.map((column) => (
                <th 
                  key={column}
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => handleSort(column)}
                >
                  <div className="flex items-center">
                    {column}
                    {renderSortIndicator(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {sortedRecords.map((record) => (
              <tr 
                key={record.id}
                className={`${selectedRecordId === record.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${editingId !== record.id ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}`}
                onClick={() => editingId !== record.id && handleRowClick(record)}
              >
                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex space-x-2">
                    {editingId === record.id ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleSaveEdit(e)}
                          className="p-1 h-8 w-8"
                          title="Save"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleCancelEdit(e)}
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
                          onClick={(e) => handleViewScripts(record, e)}
                          className={`p-1 h-8 w-8 ${selectedRecordId === record.id ? 'bg-blue-100 dark:bg-blue-800' : ''}`}
                          title={selectedRecordId === record.id ? "Unselect" : "View Scripts"}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleEdit(record, e)}
                          className="p-1 h-8 w-8"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleDelete(record.id, e)}
                          className="p-1 h-8 w-8 text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
                {orderedColumns.map((column) => (
                  <td 
                    key={`${record.id}-${column}`} 
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis max-w-xs"
                  >
                    {editingId === record.id && editedRecord ? (
                      <Input
                        value={editedRecord[column] || ''}
                        onChange={(e) => handleEditChange(column, e.target.value)}
                        className="w-full"
                        onClick={(e) => e.stopPropagation()} // Prevent row click when editing
                      />
                    ) : (
                      <CellContent value={record[column]} column={column} />
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
