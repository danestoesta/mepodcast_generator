import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jrbcegncivgmgedqmrys.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyYmNlZ25jaXZnbWdlZHFtcnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjI3MDgsImV4cCI6MjA1OTU5ODcwOH0.rER_Ac2Js6Jkd6ugF-Tx-cVcaxdHCte-tR6Ug3DryY0';

export const supabase = createClient(supabaseUrl, supabaseKey);
