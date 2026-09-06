-- 051_add_education_to_clusters.sql
-- Updating existing job clusters with education requirements

UPDATE job_clusters SET education = '{"degree": "B.Tech/MS in Computer Science", "preferred": "AWS Certified DevOps Engineer"}' WHERE cluster_id = 'AWS-CloudInfra-DevOps';
UPDATE job_clusters SET education = '{"degree": "B.Tech/M.Tech", "preferred": "AWS Solutions Architect Professional"}' WHERE cluster_id = 'AWS-SolutionsArchitect';
UPDATE job_clusters SET education = '{"degree": "B.E/B.Tech in CS/IT"}' WHERE cluster_id = 'AWS-Backend-Java-Python';
UPDATE job_clusters SET education = '{"degree": "MS/PhD in AI/ML or Data Science", "preferred": "Research Publications"}' WHERE cluster_id = 'Google-ML-Engineer';
UPDATE job_clusters SET education = '{"degree": "B.Tech/M.Tech in Data Engineering"}' WHERE cluster_id = 'Google-DataEngineer';
UPDATE job_clusters SET education = '{"degree": "B.E/B.Tech", "preferred": "Portfolio of Web Projects"}' WHERE cluster_id = 'Google-Frontend-React-Angular';
UPDATE job_clusters SET education = '{"degree": "B.Tech/MCA", "preferred": "Financial Systems Experience"}' WHERE cluster_id = 'JPMorgan-JavaBackend-FinTech';
UPDATE job_clusters SET education = '{"degree": "MS in Statistics/Finance/Math"}' WHERE cluster_id = 'JPMorgan-Data-Risk-Analytics';
UPDATE job_clusters SET education = '{"degree": "B.Tech in CS/Security", "preferred": "CISSP/CEH"}' WHERE cluster_id = 'JPMorgan-SecOps-InfoSec';
UPDATE job_clusters SET education = '{"degree": "MBA from Tier-1 Institute", "preferred": "Prior Consulting Internship"}' WHERE cluster_id = 'McKinsey-BusinessAnalyst';
UPDATE job_clusters SET education = '{"degree": "MBA in Operations/Supply Chain"}' WHERE cluster_id = 'McKinsey-Operations-Transformation';
UPDATE job_clusters SET education = '{"degree": "Bachelors in Finance/Economics/Math"}' WHERE cluster_id = 'GoldmanSachs-FrontOffice-Trading';
UPDATE job_clusters SET education = '{"degree": "MBA in Finance or CA", "preferred": "CFA Level 1/2"}' WHERE cluster_id = 'GoldmanSachs-InvestmentBank-M&A';
UPDATE job_clusters SET education = '{"degree": "B.Tech/MBA", "preferred": "Cloud Certifications"}' WHERE cluster_id = 'Deloitte-TechConsulting-Cloud';
UPDATE job_clusters SET education = '{"degree": "B.E/B.Tech", "preferred": "Open Source Contributions"}' WHERE cluster_id = 'Startup-FullStack-SaaS';
UPDATE job_clusters SET education = '{"degree": "B.Tech + MBA", "preferred": "Experience in B2B SaaS"}' WHERE cluster_id = 'Startup-ProductManager';
UPDATE job_clusters SET education = '{"degree": "B.Tech/MS in CS/DS"}' WHERE cluster_id = 'Startup-DataScience-ML';
UPDATE job_clusters SET education = '{"degree": "Any Graduate", "preferred": "Strong Communication Skills"}' WHERE cluster_id = 'Startup-Sales-BDR';
UPDATE job_clusters SET education = '{"degree": "B.Des/M.Des or equivalent portfolio"}' WHERE cluster_id = 'Startup-Design-UX';
UPDATE job_clusters SET education = '{"degree": "BBM/MBA in Marketing"}' WHERE cluster_id = 'Startup-Marketing-Growth';
