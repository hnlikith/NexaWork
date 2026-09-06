-- Seed script for 20 Job Clusters (Total 100 Job Variants)
-- Derived from job_clusters_research.md

-- Tech: AWS
INSERT INTO job_clusters (cluster_id, company, job_title_variants, mandatory_skills, domain_knowledge, experience_requirements, match_weights, gemma_keywords)
VALUES 
('AWS-CloudInfra-DevOps', 'AWS', ARRAY['DevOps Engineer', 'Cloud Engineer', 'SRE', 'Infrastructure Engineer', 'Platform Engineer'], 
'[{"skill": "AWS EC2", "importance": 9}, {"skill": "Docker", "importance": 8}, {"skill": "Kubernetes", "importance": 8}, {"skill": "Terraform", "importance": 8}]',
'[{"area": "Infrastructure Automation", "keywords": ["iac", "terraform", "automation"]}]',
'{"years_required": 2, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 25, "experience_years": 15, "soft_skills": 10, "education_certifications": 10}',
ARRAY['kubernetes', 'docker', 'terraform', 'aws', 'ci/cd', 'infrastructure as code']),

('AWS-SolutionsArchitect', 'AWS', ARRAY['Solutions Architect', 'Cloud Architect', 'Technical Architect', 'System Architect', 'Enterprise Architect'], 
'[{"skill": "AWS Ecosystem", "importance": 10}, {"skill": "System Design", "importance": 9}, {"skill": "Cost Optimization", "importance": 8}, {"skill": "Security", "importance": 9}]',
'[{"area": "Cloud Architecture & Design", "keywords": ["scalability", "high availability", "disaster recovery"]}]',
'{"years_required": 5, "seniority_levels": ["Mid", "Senior", "Principal"]}',
'{"technical_skills": 45, "domain_knowledge": 30, "experience_years": 15, "education_research": 10}',
ARRAY['aws', 'architecture', 'scalability', 'system design', 'security', 'cost optimization']),

('AWS-Backend-Java-Python', 'AWS', ARRAY['Backend Engineer', 'Java Developer', 'Python Developer', 'Software Engineer', 'Core Engineer'], 
'[{"skill": "Java/Python", "importance": 9}, {"skill": "Spring Boot/Django", "importance": 8}, {"skill": "RESTful APIs", "importance": 8}, {"skill": "NoSQL/SQL", "importance": 8}]',
'[{"area": "Distributed Systems", "keywords": ["microservices", "async", "event-driven"]}]',
'{"years_required": 2, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 25, "experience_years": 20, "soft_skills": 15}',
ARRAY['java', 'python', 'spring boot', 'django', 'backend', 'api', 'microservices']),

-- Tech: Google
('Google-ML-Engineer', 'Google', ARRAY['ML Engineer', 'Machine Learning Engineer', 'AI Engineer', 'Deep Learning Engineer', 'NLP Specialist'], 
'[{"skill": "TensorFlow/PyTorch", "importance": 9}, {"skill": "Python", "importance": 9}, {"skill": "NLP/LLMs", "importance": 8}, {"skill": "Model Deployment", "importance": 7}]',
'[{"area": "Deep Learning Architectures", "keywords": ["transformers", "attention", "neural networks"]}]',
'{"years_required": 2, "seniority_levels": ["Mid", "Senior", "Staff"]}',
'{"technical_skills": 45, "domain_knowledge": 30, "experience_years": 15, "education_research": 10}',
ARRAY['tensorflow', 'pytorch', 'machine learning', 'nlp', 'llm', 'python', 'deep learning']),

('Google-DataEngineer', 'Google', ARRAY['Data Engineer', 'Big Data Engineer', 'Analytics Engineer', 'Data Warehouse Engineer', 'ETL Developer'], 
'[{"skill": "BigQuery/Spark", "importance": 9}, {"skill": "SQL", "importance": 9}, {"skill": "ETL/ELT", "importance": 8}, {"skill": "Apache Beam", "importance": 8}]',
'[{"area": "Data Pipeline Architecture", "keywords": ["dataflow", "orchestration", "transformation"]}]',
'{"years_required": 2, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 30, "experience_years": 20, "education": 10}',
ARRAY['bigquery', 'spark', 'sql', 'data engineering', 'etl', 'data pipeline']),

('Google-Frontend-React-Angular', 'Google', ARRAY['Frontend Engineer', 'Web Developer', 'UI Engineer', 'React Developer', 'Angular Developer'], 
'[{"skill": "React/Angular", "importance": 9}, {"skill": "TypeScript", "importance": 8}, {"skill": "CSS/HTML5", "importance": 8}, {"skill": "Web Performance", "importance": 8}]',
'[{"area": "User Experience Focus", "keywords": ["accessibility", "seo", "ux"]}]',
'{"years_required": 2, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 20, "experience_years": 20, "soft_skills": 20}',
ARRAY['react', 'angular', 'frontend', 'typescript', 'ui', 'ux', 'web performance']),

-- Tech: JP Morgan
('JPMorgan-JavaBackend-FinTech', 'JP Morgan', ARRAY['Java Backend Engineer', 'Senior Java Developer', 'Systems Engineer', 'FinTech Engineer', 'Core Banking Developer'], 
'[{"skill": "Java 11+", "importance": 10}, {"skill": "Spring Boot", "importance": 9}, {"skill": "Multithreading", "importance": 9}, {"skill": "Kafka", "importance": 8}]',
'[{"area": "Financial Systems & Payments", "keywords": ["clearing", "settlement", "compliance"]}]',
'{"years_required": 2, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 45, "domain_knowledge": 25, "experience_years": 20, "education": 10}',
ARRAY['java', 'spring boot', 'multithreading', 'kafka', 'fintech', 'banking']),

('JPMorgan-Data-Risk-Analytics', 'JP Morgan', ARRAY['Data Scientist', 'Risk Analyst', 'Quantitative Analyst', 'ML Analyst', 'Financial Data Scientist'], 
'[{"skill": "Python/R/SQL", "importance": 9}, {"skill": "Statistical Analysis", "importance": 9}, {"skill": "Risk Modeling", "importance": 8}, {"skill": "Tableau", "importance": 7}]',
'[{"area": "Financial Modeling", "keywords": ["portfolio theory", "risk management", "credit risk"]}]',
'{"years_required": 2, "seniority_levels": ["Mid", "Senior", "Principal"]}',
'{"technical_skills": 40, "domain_knowledge": 30, "experience_years": 20, "education": 10}',
ARRAY['python', 'sql', 'risk modeling', 'statistics', 'financial analytics', 'data science']),

('JPMorgan-SecOps-InfoSec', 'JP Morgan', ARRAY['Security Engineer', 'InfoSec Analyst', 'Cybersecurity Specialist', 'SecOps Engineer', 'Penetration Tester'], 
'[{"skill": "Network Security", "importance": 9}, {"skill": "IDS/IPS", "importance": 8}, {"skill": "SIEM Tools", "importance": 8}, {"skill": "Incident Response", "importance": 8}]',
'[{"area": "Compliance & Standards", "keywords": ["pci dss", "iso27001", "gdpr"]}]',
'{"years_required": 2, "seniority_levels": ["Mid", "Senior", "Principal"]}',
'{"technical_skills": 40, "domain_knowledge": 30, "experience_years": 20, "education": 10}',
ARRAY['cybersecurity', 'infosec', 'network security', 'compliance', 'incident response']),

-- Non-Tech: McKinsey
('McKinsey-BusinessAnalyst', 'McKinsey', ARRAY['Business Analyst', 'Business Consultant', 'Strategy Analyst', 'Associate Consultant', 'Management Consultant'], 
'[{"skill": "Problem Decomposition", "importance": 9}, {"skill": "Excel", "importance": 8}, {"skill": "BI Tools", "importance": 7}, {"skill": "Market Research", "importance": 7}]',
'[{"area": "Business Frameworks", "keywords": ["swot", "porter five forces", "strategy"]}]',
'{"years_required": 0, "seniority_levels": ["Associate", "Senior Associate", "Project Leader"]}',
'{"technical_skills": 25, "domain_knowledge": 35, "soft_skills": 30, "education": 10}',
ARRAY['business analysis', 'consulting', 'excel', 'strategy', 'problem solving']),

('McKinsey-Operations-Transformation', 'McKinsey', ARRAY['Operations Consultant', 'Transformation Lead', 'Lean Specialist', 'Supply Chain Analyst', 'Process Engineer'], 
'[{"skill": "Lean/Six Sigma", "importance": 9}, {"skill": "Supply Chain", "importance": 8}, {"skill": "Change Management", "importance": 8}, {"skill": "ERP Systems", "importance": 7}]',
'[{"area": "Process Improvement", "keywords": ["optimization", "transformation", "manufacturing"]}]',
'{"years_required": 4, "seniority_levels": ["Senior Consultant", "Manager", "Principal"]}',
'{"technical_skills": 30, "domain_knowledge": 40, "soft_skills": 20, "education": 10}',
ARRAY['operations', 'lean', 'six sigma', 'transformation', 'supply chain']),

-- Non-Tech: Goldman Sachs
('GoldmanSachs-FrontOffice-Trading', 'Goldman Sachs', ARRAY['Trader', 'Execution Specialist', 'Quantitative Trader', 'Market Specialist', 'Front Office Analyst'], 
'[{"skill": "Financial Markets", "importance": 9}, {"skill": "Risk Management", "importance": 9}, {"skill": "Trading Platforms", "importance": 8}, {"skill": "Python/C++", "importance": 7}]',
'[{"area": "Market Microstructure", "keywords": ["liquidity", "hedging", "arbitrage"]}]',
'{"years_required": 0, "seniority_levels": ["Analyst", "Associate", "Vice President"]}',
'{"technical_skills": 35, "domain_knowledge": 40, "experience_years": 15, "education": 10}',
ARRAY['trading', 'finance', 'risk management', 'python', 'c++', 'quantitative']),

('GoldmanSachs-InvestmentBank-M&A', 'Goldman Sachs', ARRAY['M&A Associate', 'IB Analyst', 'Corporate Finance Lead', 'Investment Banker', 'Deal Specialist'], 
'[{"skill": "Valuation Methods", "importance": 9}, {"skill": "Financial Analysis", "importance": 9}, {"skill": "Excel Modeling", "importance": 8}, {"skill": "M&A Process", "importance": 8}]',
'[{"area": "Corporate Transactions", "keywords": ["ipo", "due diligence", "deal structuring"]}]',
'{"years_required": 0, "seniority_levels": ["Analyst", "Associate", "Vice President"]}',
'{"technical_skills": 35, "domain_knowledge": 45, "experience_years": 10, "education": 10}',
ARRAY['m&a', 'investment banking', 'finance', 'valuation', 'modeling']),

-- Non-Tech: Deloitte
('Deloitte-TechConsulting-Cloud', 'Deloitte', ARRAY['Cloud Consultant', 'Tech Transformation Lead', 'ERP Specialist', 'Enterprise Architect', 'Solution Designer'], 
'[{"skill": "Cloud Platforms", "importance": 9}, {"skill": "ERP (SAP/Oracle)", "importance": 8}, {"skill": "TOGAF", "importance": 7}, {"skill": "Change Management", "importance": 8}]',
'[{"area": "Enterprise Transformation", "keywords": ["implementation", "roadmap", "architecture"]}]',
'{"years_required": 1, "seniority_levels": ["Consultant", "Senior Consultant", "Manager"]}',
'{"technical_skills": 35, "domain_knowledge": 35, "experience_years": 20, "education": 10}',
ARRAY['consulting', 'cloud', 'erp', 'architecture', 'transformation']),

-- Startups: Bengaluru Ecosystem
('Startup-FullStack-SaaS', 'Namaah Tech', ARRAY['Full Stack Developer', 'SaaS Engineer', 'Product Engineer', 'Node.js Developer', 'React Developer'], 
'[{"skill": "React/Node.js", "importance": 9}, {"skill": "PostgreSQL", "importance": 8}, {"skill": "AWS/GCP", "importance": 7}, {"skill": "API Design", "importance": 8}]',
'[{"area": "SaaS Growth Metrics", "keywords": ["mrr", "cac", "ltv"]}]',
'{"years_required": 0, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 25, "experience_years": 20, "soft_skills": 15}',
ARRAY['full stack', 'react', 'node.js', 'saas', 'startup', 'product']),

('Startup-ProductManager', 'Namaah Tech', ARRAY['Product Manager', 'APM', 'Senior PM', 'Group PM', 'Growth PM'], 
'[{"skill": "Product Strategy", "importance": 9}, {"skill": "User Research", "importance": 9}, {"skill": "SQL/Analytics", "importance": 8}, {"skill": "Figma", "importance": 7}]',
'[{"area": "GTM Strategy", "keywords": ["sales support", "roadmap", "prioritization"]}]',
'{"years_required": 0, "seniority_levels": ["Associate PM", "PM", "Senior PM"]}',
'{"technical_skills": 25, "domain_knowledge": 35, "soft_skills": 30, "education": 10}',
ARRAY['product management', 'strategy', 'user research', 'gtm', 'roadmap']),

('Startup-DataScience-ML', 'Namaah Tech', ARRAY['Data Scientist', 'ML Engineer', 'AI Researcher', 'Data Analyst', 'NLP Engineer'], 
'[{"skill": "Python/Pandas", "importance": 9}, {"skill": "Scikit-Learn", "importance": 8}, {"skill": "Deep Learning", "importance": 8}, {"skill": "Statistics", "importance": 8}]',
'[{"area": "MLOps & Scale", "keywords": ["deployment", "pipelines", "accuracy"]}]',
'{"years_required": 1, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 45, "domain_knowledge": 25, "experience_years": 20, "education": 10}',
ARRAY['data science', 'machine learning', 'python', 'ai', 'analytics']),

('Startup-Sales-BDR', 'Namaah Tech', ARRAY['BDR', 'SDR', 'Sales Executive', 'Account Manager', 'Growth Specialist'], 
'[{"skill": "Lead Generation", "importance": 9}, {"skill": "CRM (Hubspot/Salesforce)", "importance": 8}, {"skill": "Communication", "importance": 10}, {"skill": "Negotiation", "importance": 8}]',
'[{"area": "B2B SaaS Sales", "keywords": ["outbound", "pipeline", "quota"]}]',
'{"years_required": 0, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 20, "domain_knowledge": 30, "soft_skills": 40, "experience_years": 10}',
ARRAY['sales', 'business development', 'bdr', 'sdr', 'crm', 'growth']),

('Startup-Design-UX', 'Namaah Tech', ARRAY['UX Designer', 'UI Designer', 'Product Designer', 'Interaction Designer', 'Visual Designer'], 
'[{"skill": "Figma/Adobe XD", "importance": 9}, {"skill": "Design Systems", "importance": 8}, {"skill": "User Research", "importance": 8}, {"skill": "Prototyping", "importance": 8}]',
'[{"area": "Product Design Flow", "keywords": ["wireframing", "usability", "accessibility"]}]',
'{"years_required": 0, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 40, "domain_knowledge": 20, "soft_skills": 20, "experience_years": 20}',
ARRAY['ux', 'ui', 'design', 'product design', 'figma', 'prototyping']),

('Startup-Marketing-Growth', 'Namaah Tech', ARRAY['Growth Marketer', 'Performance Marketing', 'SEO Specialist', 'Content Strategist', 'Marketing Manager'], 
'[{"skill": "Google Ads/FB Ads", "importance": 9}, {"skill": "SEO/SEM", "importance": 8}, {"skill": "Analytics (GA4)", "importance": 8}, {"skill": "Content Creation", "importance": 7}]',
'[{"area": "Inbound & Outbound", "keywords": ["conversion", "retention", "branding"]}]',
'{"years_required": 0, "seniority_levels": ["Junior", "Mid", "Senior"]}',
'{"technical_skills": 35, "domain_knowledge": 30, "soft_skills": 20, "experience_years": 15}',
ARRAY['marketing', 'growth', 'seo', 'ads', 'content', 'analytics']);
