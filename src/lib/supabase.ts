import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ercnehjywfphrgqaepzi.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyY25laGp5d2ZwaHJncWFlcHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NzIxNTAsImV4cCI6MjA4NjE0ODE1MH0.I0mFLNeqxK25nJEoF4omFN58F0HelrVoyT65Fi4tZB8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
