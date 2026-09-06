"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect } from "react";
import { 
  Briefcase, 
  MapPin, 
  Clock, 
  Search, 
  Filter, 
  ChevronRight, 
  Upload, 
  CheckCircle2, 
  X,
  Loader2,
  Zap,
  Globe,
  Building2,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/BadgeLegacy";
import { Button } from "@/components/ui/ButtonLegacy";
import { supabase } from "@/lib/supabase";

interface JobCluster {
  id: number;
  cluster_id: string;
  company: string;
  job_title_variants: string[];
  mandatory_skills: { skill: string; importance: number }[];
  domain_knowledge: { area: string; keywords: string[] }[];
  experience_requirements: { years_required: number; seniority_levels: string[] };
  match_weights: any;
  gemma_keywords: string[];
}

export default function CareerPortal() {
  const [clusters, setClusters] = useState<JobCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<JobCluster | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    resume: null as File | null,
  });

  useEffect(() => {
    fetchClusters();
  }, []);

  async function fetchClusters() {
    try {
      const { data, error } = await supabase
        .from("job_clusters")
        .select("*")
        .eq("active", true)
        .order("company", { ascending: true });

      if (error) throw error;
      setClusters(data || []);
    } catch (err) {
      console.error("Error fetching clusters:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredClusters = clusters.filter(c => 
    c.job_title_variants.some(v => v.toLowerCase().includes(searchTerm.toLowerCase())) ||
    c.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCluster || !formData.resume) return;

    setFormLoading(true);
    try {
      // 1. Upload Resume to Supabase Storage
      const fileExt = formData.resume.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `resumes/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("recruitment-resumes")
        .upload(filePath, formData.resume);

      if (uploadError) throw uploadError;

      // 2. Create Application Entry
      const applicationId = `APP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const { error: appError } = await supabase
        .from("applications")
        .insert({
          application_id: applicationId,
          applicant_name: formData.name,
          applicant_email: formData.email,
          applicant_phone: formData.phone,
          applicant_location: formData.location,
          applied_cluster_id: selectedCluster.cluster_id,
          resume_file_path: filePath,
          resume_file_size: formData.resume.size,
          processing_status: "pending"
        });

      if (appError) throw appError;

      setApplied(true);
      setTimeout(() => {
        setIsApplying(false);
        setApplied(false);
        setSelectedCluster(null);
        setFormData({ name: "", email: "", phone: "", location: "", resume: null });
      }, 3000);

    } catch (err) {
      console.error("Application error:", err);
      alert("Failed to submit application. Please try again.");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-theme-primary/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-theme-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-theme-primary flex items-center justify-center font-black text-lg">N</div>
            <span className="text-xl font-black tracking-tight">NexaWork <span className="text-theme-primary">Careers</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-white/60">
            <a href="#" className="hover:text-theme-primary transition-colors">Our Culture</a>
            <a href="#" className="hover:text-theme-primary transition-colors">Benefits</a>
            <a href="#" className="hover:text-theme-primary transition-colors">Open Roles</a>
            <Button variant="primary" size="sm" className="rounded-full px-6">Sign In</Button>
          </div>
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto px-6 py-20">
        {/* Hero Section */}
        <div className="text-center space-y-8 mb-24">
          <Badge variant="info" className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] bg-theme-primary/10 border-theme-primary/20 mb-4">
            Join the Future of FinTech
          </Badge>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
            Build What <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-theme-primary via-purple-500 to-sky-500">Matters Most.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-white/40 font-medium">
            Join our autonomous recruitment intelligence ecosystem. We're hiring across 20+ specialized clusters from AWS Cloud to Neural ML Engineering.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="relative max-w-3xl mx-auto mb-16">
          <div className="absolute inset-0 bg-theme-primary/20 blur-[60px] opacity-20" />
          <div className="relative flex items-center gap-4 p-2 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-2xl">
            <div className="flex-1 flex items-center gap-4 px-4">
              <Search className="text-white/40" size={20} />
              <input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search jobs, skills, or companies..."
                className="w-full bg-transparent border-none outline-none text-lg font-bold placeholder:text-white/20 py-4"
              />
            </div>
            <Button variant="primary" className="rounded-2xl px-8 h-14 font-black uppercase tracking-widest text-xs">
              Search Roles
            </Button>
          </div>
        </div>

        {/* Job Clusters Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-theme-primary" size={40} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Initializing Job Matrix...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClusters.map((cluster) => (
              <div 
                key={cluster.id}
                className="group relative bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/[0.08] hover:border-theme-primary/30 transition-all duration-500 cursor-pointer overflow-hidden"
                onClick={() => {
                  setSelectedCluster(cluster);
                  setIsApplying(true);
                }}
              >
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-700">
                  <Briefcase size={120} />
                </div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                       <div className="h-10 w-10 rounded-xl bg-theme-primary/20 flex items-center justify-center text-theme-primary border border-theme-primary/30">
                          <Zap size={18} />
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{cluster.company}</span>
                    </div>
                    <Badge variant="default" className="bg-white/10 text-white/60 border-none text-[9px] uppercase tracking-widest px-3 py-1">
                      {cluster.cluster_id.split('-')[0]}
                    </Badge>
                  </div>

                  <h3 className="text-2xl font-black text-white group-hover:text-theme-primary transition-colors leading-tight mb-2">
                    {cluster.job_title_variants[0]}
                  </h3>
                  <div className="flex items-center gap-4 text-white/40 text-xs font-bold mb-8">
                     <div className="flex items-center gap-1.5">
                        <MapPin size={14} /> Bengaluru
                     </div>
                     <div className="flex items-center gap-1.5">
                        <Clock size={14} /> Full Time
                     </div>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Core Competencies</p>
                    <div className="flex flex-wrap gap-2">
                      {cluster.mandatory_skills.slice(0, 3).map((s, i) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-white/60">
                          {s.skill}
                        </span>
                      ))}
                      {cluster.mandatory_skills.length > 3 && (
                        <span className="text-[10px] font-bold text-white/20">+{cluster.mandatory_skills.length - 3} more</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                     <span className="text-xs font-black text-theme-primary uppercase tracking-widest">Apply Now</span>
                     <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-theme-primary group-hover:text-black transition-all">
                        <ChevronRight size={18} />
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredClusters.length === 0 && (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 mx-auto mb-6">
              <Search size={40} />
            </div>
            <h3 className="text-2xl font-black text-white/60">No roles found</h3>
            <p className="text-white/40 font-medium mt-2">Try adjusting your search or explore other clusters.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-20 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-theme-primary flex items-center justify-center font-black">N</div>
              <span className="text-lg font-black">NexaWork</span>
            </div>
            <p className="text-white/40 max-w-sm text-sm font-medium leading-relaxed">
              Pioneering the next generation of autonomous business intelligence. Build the tools that power the global financial ecosystem.
            </p>
            <div className="flex gap-4">
              {[Globe, Building2, Sparkles].map((Icon, i) => (
                <div key={i} className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-theme-primary hover:bg-white/10 transition-all cursor-pointer">
                  <Icon size={18} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-white mb-6">Organization</h4>
            <ul className="space-y-4 text-sm font-bold text-white/40">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Global Offices</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Sustainability</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Press Kit</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-white mb-6">Support</h4>
            <ul className="space-y-4 text-sm font-bold text-white/40">
              <li><a href="#" className="hover:text-white transition-colors">Candidate FAQ</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact HR</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">© 2026 NexaWork. All rights reserved.</p>
          <p className="text-[10px] font-bold text-theme-primary uppercase tracking-widest">Gemma 4 Recruitment Intelligence Active</p>
        </div>
      </footer>

      {/* Application Modal */}
      {isApplying && selectedCluster && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !formLoading && setIsApplying(false)} />
          <div className="relative w-full max-w-4xl bg-[#0a0a0a] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95 fade-in duration-300">
            {applied ? (
              <div className="p-20 text-center space-y-6">
                <div className="h-24 w-24 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto animate-bounce">
                  <CheckCircle2 size={48} />
                </div>
                <h2 className="text-4xl font-black text-white">Application Received!</h2>
                <p className="text-white/40 max-w-sm mx-auto font-medium">
                  Your profile has been queued for our **Gemma 4 Cognitive Audit**. We'll notify you once our AI analysis is complete.
                </p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row h-full">
                {/* Left: Info */}
                <div className="w-full md:w-[40%] bg-theme-primary/5 p-12 flex flex-col border-r border-white/5">
                  <div className="mb-12">
                    <Badge variant="info" className="mb-4">Selected Role</Badge>
                    <h2 className="text-3xl font-black leading-tight text-white">{selectedCluster.job_title_variants[0]}</h2>
                    <p className="text-theme-primary font-bold mt-2 uppercase tracking-widest text-[10px]">{selectedCluster.company}</p>
                  </div>

                  <div className="space-y-8 flex-1">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Evaluation Criteria</p>
                      <ul className="space-y-3">
                        {selectedCluster.mandatory_skills.map((s, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-bold text-white/60">
                             <div className="h-1.5 w-1.5 rounded-full bg-theme-primary" />
                             {s.skill}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-6 rounded-2xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-3 mb-3 text-theme-primary">
                        <Sparkles size={18} />
                        <span className="text-xs font-black uppercase tracking-widest">AI Audit Process</span>
                      </div>
                      <p className="text-[11px] text-white/40 font-medium leading-relaxed">
                        Our local Gemma 4:e4b model will analyze your resume against {selectedCluster.gemma_keywords.length} neural markers to determine suitability.
                      </p>
                    </div>
                  </div>

                  <div className="pt-12 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    Job ID: {selectedCluster.cluster_id}
                  </div>
                </div>

                {/* Right: Form */}
                <div className="flex-1 p-12">
                  <div className="flex justify-between items-center mb-10">
                    <h3 className="text-xl font-black uppercase tracking-widest">Candidate Profile</h3>
                    <button 
                      onClick={() => setIsApplying(false)}
                      className="h-10 w-10 rounded-full hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleApply} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Full Name</label>
                        <input 
                          required
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                          placeholder="Aravind Kumar"
                          className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm font-bold focus:border-theme-primary transition-all outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Email Address</label>
                        <input 
                          required
                          type="email"
                          value={formData.email}
                          onChange={e => setFormData({...formData, email: e.target.value})}
                          placeholder="aravind@example.com"
                          className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm font-bold focus:border-theme-primary transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Phone Number</label>
                        <input 
                          required
                          value={formData.phone}
                          onChange={e => setFormData({...formData, phone: e.target.value})}
                          placeholder="+91 98765 43210"
                          className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm font-bold focus:border-theme-primary transition-all outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Current Location</label>
                        <input 
                          required
                          value={formData.location}
                          onChange={e => setFormData({...formData, location: e.target.value})}
                          placeholder="Bengaluru, KA"
                          className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm font-bold focus:border-theme-primary transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Resume (PDF)</label>
                      <div className="relative group">
                        <input 
                          type="file" 
                          accept=".pdf"
                          required
                          onChange={e => setFormData({...formData, resume: e.target.files?.[0] || null})}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className={cn(
                          "w-full h-32 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center transition-all",
                          formData.resume 
                            ? "bg-emerald-500/5 border-emerald-500/30" 
                            : "bg-white/5 border-white/10 group-hover:border-theme-primary/30 group-hover:bg-theme-primary/5"
                        )}>
                          {formData.resume ? (
                            <div className="flex flex-col items-center gap-2">
                               <CheckCircle2 className="text-emerald-500" size={24} />
                               <span className="text-xs font-black text-white/80">{formData.resume.name}</span>
                               <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Click to change file</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                               <Upload className="text-white/20 group-hover:text-theme-primary transition-colors" size={24} />
                               <span className="text-xs font-black text-white/40 uppercase tracking-widest">Drop Resume or Click to Upload</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit"
                      variant="primary" 
                      className="w-full h-16 rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-theme-primary/20"
                      disabled={formLoading}
                    >
                      {formLoading ? (
                        <>
                          <Loader2 className="animate-spin mr-3" size={20} />
                          Encrypting & Uploading...
                        </>
                      ) : (
                        "Submit Application"
                      )}
                    </Button>
                    <p className="text-center text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      By submitting, you agree to our data processing policy.
                    </p>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
