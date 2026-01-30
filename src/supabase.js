import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hihmlqaedctvpktzttug.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaG1scWFlZGN0dnBrdHp0dHVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MjY0MTIsImV4cCI6MjA4NTMwMjQxMn0.DzO7jxmX4ZF63lRqXnstDP8K7jhfvDpjwY-lctUahJQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
