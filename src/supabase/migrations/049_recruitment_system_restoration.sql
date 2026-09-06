-- 049_recruitment_system_restoration.sql
-- Reconstruction of the Recruitment & ATS System

-- 1. Job Clusters Table
CREATE TABLE IF NOT EXISTS job_clusters (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  cluster_id TEXT UNIQUE NOT NULL DEFAULT ('CLUS-' || upper(substring(gen_random_uuid()::text from 1 for 8))),
  company TEXT NOT NULL,
  job_title_variants TEXT[] NOT NULL,
  mandatory_skills JSONB NOT NULL,
  preferred_skills JSONB,
  domain_knowledge JSONB NOT NULL,
  experience_requirements JSONB NOT NULL,
  education JSONB,
  match_weights JSONB NOT NULL,
  gemma_keywords TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_clusters_active ON job_clusters(active);
CREATE INDEX IF NOT EXISTS idx_clusters_company ON job_clusters(company);

-- 2. Applications Table
CREATE TABLE IF NOT EXISTS applications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  application_id TEXT UNIQUE NOT NULL DEFAULT ('APP-' || upper(substring(gen_random_uuid()::text from 1 for 8))),
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  applicant_dob DATE,
  applicant_location TEXT,
  applied_cluster_id TEXT NOT NULL REFERENCES job_clusters(cluster_id),
  resume_file_path TEXT,
  resume_file_size INT,
  raw_resume_text TEXT,
  processing_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  processing_error TEXT,
  decision TEXT DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resume_uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ocr_completed_at TIMESTAMP WITH TIME ZONE,
  gemma_analysis_started_at TIMESTAMP WITH TIME ZONE,
  gemma_analysis_completed_at TIMESTAMP WITH TIME ZONE,
  talent_analysis_ready_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT valid_decision CHECK (decision IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(processing_status);
CREATE INDEX IF NOT EXISTS idx_apps_cluster ON applications(applied_cluster_id);
CREATE INDEX IF NOT EXISTS idx_apps_created ON applications(created_at DESC);

-- 3. Talent Analysis Table (AI Output)
CREATE TABLE IF NOT EXISTS talent_analysis (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(application_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES job_clusters(cluster_id),
  resume_profile JSONB NOT NULL,
  scoring JSONB NOT NULL,
  multi_cluster_fit JSONB,
  gap_analysis JSONB,
  recommendations JSONB,
  interview_questions JSONB, -- Added for HR interview support
  gemma_raw_response JSONB,
  gemma_processing_time_ms INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_app ON talent_analysis(application_id);
CREATE INDEX IF NOT EXISTS idx_talent_cluster ON talent_analysis(cluster_id);

-- Enable RLS
ALTER TABLE job_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_analysis ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone can view active job clusters
CREATE POLICY "Anyone can view active job clusters" ON job_clusters
  FOR SELECT USING (active = true);

-- Applicants (authenticated or public depending on your needs, but usually public for career page)
-- For now, let's allow public inserts for applications so anyone can apply
CREATE POLICY "Public can apply for jobs" ON applications
  FOR INSERT WITH CHECK (true);

-- Authenticated users (HR/Admin) can see everything
CREATE POLICY "Admin/HR can manage recruitment" ON job_clusters
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin/HR can manage applications" ON applications
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admin/HR can manage talent analysis" ON talent_analysis
  FOR ALL TO authenticated USING (true);

-- Storage Setup Recommendation (Manual step in Supabase UI)
-- Bucket: recruitment-resumes
-- Folder: resumes/
