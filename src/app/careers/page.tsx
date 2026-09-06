"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useRef } from "react";
import { 
  Briefcase, 
  Search, 
  MapPin, 
  Clock, 
  ArrowRight, 
  Upload, 
  CheckCircle2, 
  Loader2,
  X,
  User,
  Mail,
  Phone,
  Calendar,
  FileText,
  Building2,
  Zap,
  ChevronRight,
  Globe,
  Award,
  Cpu,
  ShieldCheck,
  Activity,
  Terminal,
  Scan,
  Database,
  BrainCircuit,
  Network
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/ButtonLegacy";
import { useToast } from "@/components/ui/ToastLegacy";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

// ─── Neural Orb Component (Light Mode) ──────────────────────────

function NeuralOrb() {
  return (
    <div className="relative h-[400px] w-[400px] flex items-center justify-center">
      {/* Outer Glow */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full"
      />
      
      {/* Inner Core */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="relative h-64 w-64 rounded-full border border-indigo-500/10 flex items-center justify-center overflow-hidden bg-white/50 backdrop-blur-3xl shadow-2xl shadow-indigo-100"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-transparent to-emerald-500/20 opacity-30" />
        
        {/* Pulsing Particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [0.05, 0.2, 0.05],
              rotate: [0, 180, 360]
            }}
            transition={{ 
              duration: 3 + i, 
              repeat: Infinity, 
              ease: "easeInOut",
              delay: i * 0.5
            }}
            className="absolute border border-indigo-500/10 rounded-full"
            style={{ 
              width: `${(i + 1) * 20}%`, 
              height: `${(i + 1) * 20}%`,
              transform: `rotate(${i * 45}deg)`
            }}
          />
        ))}

        {/* Central Core */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="h-20 w-20 rounded-full bg-indigo-600 shadow-[0_0_50px_rgba(79,70,229,0.3)] flex items-center justify-center"
        >
          <Zap size={32} className="text-white" />
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── 3D Tilt Card Component (Light Mode) ────────────────────────

function JobCard({ job, onClick }: { job: any, onClick: () => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div 
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className="group relative h-[380px] rounded-[40px] bg-white border border-slate-200 hover:border-indigo-500/30 transition-all duration-500 cursor-pointer overflow-hidden p-8 flex flex-col justify-between shadow-xl shadow-slate-200/40"
    >
       {/* Background Glow */}
       <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
       
       {/* Content */}
       <div className="relative z-10 space-y-6" style={{ transform: "translateZ(50px)" }}>
          <div className="flex items-start justify-between">
             <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all">
                <Briefcase size={24} />
             </div>
             <div className="flex flex-col items-end">
                <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                   <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Neural Sync Active</span>
                </div>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">ID: {job.cluster_id}</span>
             </div>
          </div>

          <div>
             <h3 className="text-4xl font-black text-slate-900 uppercase leading-[0.9] tracking-tighter group-hover:text-indigo-600 transition-colors">
                {job.job_title_variants[0]}
             </h3>
             <div className="flex flex-wrap gap-2 mt-4">
                {job.gemma_keywords.slice(0, 3).map((tag: string) => (
                   <span key={tag} className="px-3 py-1 bg-slate-50 text-[9px] font-black text-slate-400 uppercase rounded-lg border border-slate-100">{tag}</span>
                ))}
             </div>
          </div>
       </div>

       <div className="relative z-10 flex items-center justify-between" style={{ transform: "translateZ(30px)" }}>
          <div className="space-y-1">
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Match Reliability</p>
             <div className="flex items-center gap-3">
                <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                   <motion.div 
                     initial={{ width: 0 }}
                     whileInView={{ width: "94.2%" }}
                     className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500" 
                   />
                </div>
                <span className="text-xs font-black text-indigo-500">94.2%</span>
             </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center group-hover:scale-110 transition-all shadow-lg shadow-slate-200">
             <ChevronRight size={20} />
          </div>
       </div>
    </motion.div>
  );
}

// ─── Main Careers Portal (Light Mode) ───────────────────────────

export default function CareersPortal() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processStep, setProcessStep] = useState(1);
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    location: "",
    resume: null as File | null,
    resumeText: ""
  });

  useEffect(() => {
    const fetchJobs = async () => {
      const { data, error } = await supabase
        .from("job_clusters")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (error) {
        showToast("Failed to fetch jobs", "error");
      } else {
        setJobs(data || []);
      }
      setLoading(false);
    };

    fetchJobs();

    // Subscribe to changes
    const channel = supabase
      .channel('job-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_clusters' }, fetchJobs)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [showToast]);

  const filteredJobs = jobs.filter(j => 
    j.job_title_variants[0].toLowerCase().includes(searchTerm.toLowerCase()) ||
    j.cluster_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
       const generatedAppId = `CAR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
       let filePath = null;

       if (form.resume) {
          filePath = `candidates/${generatedAppId}_${form.resume.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
          const { error: uploadError } = await supabase.storage.from("resumes").upload(filePath, form.resume);
          if (uploadError) throw uploadError;
       }
       
       const { data: app, error } = await supabase
          .from("applications")
          .insert({
             application_id: generatedAppId,
             applied_cluster_id: selectedJob.cluster_id,
             applicant_name: form.name,
             applicant_email: form.email,
             resume_file_path: filePath,
             raw_resume_text: "",
             processing_status: "pending"
          })
          .select()
          .single();

       if (error) throw error;

       // 2. AI Engine Autonomy
       // No manual trigger needed; the PM2 Python service will detect this 'pending' application
       // and process it via the Gemma 4 engine on the Mac Mini automatically.

       setProcessStep(3);
       showToast("Application Ingested Successfully", "success");
    } catch (err: any) {
       showToast(err.message, "error");
    } finally {
       setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* HUD Header (Light) */}
      <nav className="fixed top-0 inset-x-0 h-24 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-200 flex items-center justify-between px-12">
         <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-indigo-600 text-white flex items-center justify-center font-black text-xl rounded-xl shadow-lg shadow-indigo-100">N</div>
            <div className="flex flex-col">
               <span className="text-sm font-black uppercase tracking-tighter leading-none">NexaWork</span>
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Recruitment_Portal v2.0</span>
            </div>
         </div>

         <div className="hidden md:flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            <a href="#" className="hover:text-indigo-600 transition-colors flex items-center gap-2">
               <ShieldCheck size={14} /> Security
            </a>
            <a href="#" className="hover:text-indigo-600 transition-colors flex items-center gap-2">
               <Cpu size={14} /> Systems
            </a>
            <a href="#" className="hover:text-indigo-600 transition-colors flex items-center gap-2">
               <Network size={14} /> Neural Grid
            </a>
         </div>

         <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
               <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Gemma4_Core: Online</span>
               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Nodes: 1,420 Active</span>
            </div>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest px-8 h-12 rounded-xl">
               Access Portal
            </Button>
         </div>
      </nav>

      <main className="relative pt-32 pb-40 px-8 max-w-7xl mx-auto">
         {/* Hero Section with Orb */}
         <div className="flex flex-col lg:flex-row items-center justify-between gap-20 mb-32">
            <div className="flex-1 space-y-10">
               <motion.div 
                 initial={{ opacity: 0, x: -50 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white border border-slate-200 shadow-sm backdrop-blur-xl"
               >
                  <div className="h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Recruitment Neural Engine v4.2.1</span>
               </motion.div>

               <motion.h1 
                 initial={{ opacity: 0, y: 30 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.1 }}
                 className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.8] uppercase text-slate-900"
               >
                  The <span className="text-indigo-600">Future</span> <br />
                  is Synchronized.
               </motion.h1>

               <motion.p 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.2 }}
                 className="text-xl font-medium text-slate-500 leading-relaxed max-w-xl"
               >
                  Join the elite. Our autonomous intelligence engine maps your cognitive profile to our global mission objectives.
               </motion.p>

               {/* Neural Ingestion Search */}
               <motion.div 
                 initial={{ opacity: 0, y: 30 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.3 }}
                 className="relative max-w-lg mt-12 group"
               >
                  <div className="absolute -inset-1 bg-indigo-600/10 rounded-[24px] blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
                  <div className="relative h-20 w-full rounded-[24px] bg-white border border-slate-200 flex items-center px-8 overflow-hidden shadow-xl shadow-slate-200/50">
                     {/* Scanning Line */}
                     <motion.div 
                       animate={{ x: ["-100%", "100%"] }}
                       transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                       className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent skew-x-12"
                     />
                     <Search className="text-slate-300 mr-4" size={24} />
                     <input 
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       placeholder="Ingest job parameters..."
                       className="flex-1 bg-transparent text-lg font-bold placeholder:text-slate-300 outline-none text-slate-900"
                     />
                     <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <Scan size={20} />
                     </div>
                  </div>
               </motion.div>
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="hidden lg:block"
            >
               <NeuralOrb />
            </motion.div>
         </div>

         {/* Job Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <AnimatePresence>
               {loading ? (
                  [1,2,3,4,5,6].map(i => (
                     <div key={i} className="h-[380px] rounded-[40px] bg-white animate-pulse border border-slate-100 shadow-sm" />
                  ))
               ) : filteredJobs.map((job, idx) => (
                  <JobCard 
                    key={job.cluster_id} 
                    job={job} 
                    onClick={() => {
                       setProcessStep(1);
                       setSelectedJob(job);
                    }} 
                  />
               ))}
            </AnimatePresence>
         </div>

         {/* Empty State */}
         {!loading && filteredJobs.length === 0 && (
            <div className="text-center py-40 space-y-6">
               <Terminal size={64} className="mx-auto text-slate-100" />
               <h3 className="text-2xl font-black text-slate-200 uppercase tracking-widest">No Intelligence Clusters Found</h3>
               <p className="text-slate-400 max-w-xs mx-auto">Try adjusting your ingestion parameters or search for a different domain.</p>
            </div>
         )}
      </main>

      {/* Futuristic Application Modal (Light) */}
      <AnimatePresence>
        {selectedJob && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !submitting && setSelectedJob(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-3xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-5xl bg-white rounded-[56px] shadow-2xl overflow-hidden border border-slate-200"
            >
               <div className="flex flex-col lg:flex-row h-full max-h-[90vh]">
                  {/* Left: Neural Profile */}
                  <div className="w-full lg:w-[450px] bg-slate-50 p-16 space-y-10 border-r border-slate-200">
                     <div className="space-y-6">
                        <div className="h-20 w-20 bg-indigo-600 rounded-[28px] flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                           <Database size={40} />
                        </div>
                        <div>
                           <h2 className="text-4xl font-black leading-[0.9] tracking-tighter uppercase text-slate-900">{selectedJob.job_title_variants[0]}</h2>
                           <div className="inline-block px-3 py-1 bg-indigo-100 border border-indigo-200 rounded-md mt-4">
                              <p className="text-indigo-600 text-[9px] font-black uppercase tracking-[0.2em]">Neural Match Protocol: Enabled</p>
                           </div>
                        </div>
                     </div>

                     <div className="space-y-6 pt-10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-4">Job Requirements Ingested:</p>
                        <div className="space-y-4">
                           {selectedJob.mandatory_skills.slice(0, 4).map((s: any) => (
                              <div key={s.skill} className="flex items-center justify-between">
                                 <span className="text-sm font-bold text-slate-600">{s.skill}</span>
                                 <span className="text-[10px] font-black text-indigo-500 uppercase">Required</span>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="p-8 rounded-[32px] bg-white border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-400 leading-relaxed italic">
                           "Our neural engine will automatically parse your experience and calculate alignment in real-time. Please ensure your PDF is high-fidelity."
                        </p>
                     </div>
                  </div>

                  {/* Right: Ingestion Form */}
                  <div className="flex-1 p-16 overflow-y-auto scrollbar-hide bg-white">
                     <div className="flex justify-between items-center mb-12">
                        <div className="flex items-center gap-3">
                           <div className="h-3 w-3 rounded-full bg-indigo-600 animate-pulse" />
                           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 italic">Syncing with Central Intelligence...</span>
                        </div>
                        <button 
                          onClick={() => !submitting && setSelectedJob(null)}
                          className="h-12 w-12 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                        >
                           <X size={24} />
                        </button>
                     </div>

                     {processStep === 3 ? (
                        <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-10">
                           <div className="relative">
                              <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="h-32 w-32 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-100"
                              >
                                 <CheckCircle2 size={64} />
                              </motion.div>
                           </div>
                           <div className="space-y-4">
                              <h3 className="text-5xl font-black tracking-tighter uppercase text-slate-900">Sync Established</h3>
                              <p className="text-slate-500 font-medium max-w-sm mx-auto text-lg">
                                 Your neural profile has been uploaded to the grid. Stand by for cognitive audit results.
                              </p>
                           </div>
                           <Button 
                             onClick={() => setSelectedJob(null)}
                             className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest px-10 h-16 rounded-2xl shadow-xl shadow-slate-200"
                           >
                              Close Console
                           </Button>
                        </div>
                     ) : (
                        <form onSubmit={handleApply} className="space-y-10">
                           <div className="space-y-8">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                 <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Target Name</label>
                                    <input 
                                      required
                                      value={form.name}
                                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                                      className="h-16 w-full rounded-2xl bg-slate-50 border border-slate-200 px-8 text-base font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                      placeholder="Full Legal Name"
                                    />
                                 </div>
                                 <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sync Address (Email)</label>
                                    <input 
                                      required
                                      type="email"
                                      value={form.email}
                                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                                      className="h-16 w-full rounded-2xl bg-slate-50 border border-slate-200 px-8 text-base font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                      placeholder="primary@intelligence.net"
                                    />
                                 </div>
                              </div>

                              <div className="space-y-3">
                                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Geographic Node</label>
                                 <input 
                                   required
                                   value={form.location}
                                   onChange={(e) => setForm({ ...form, location: e.target.value })}
                                   className="h-16 w-full rounded-2xl bg-slate-50 border border-slate-200 px-8 text-base font-bold text-slate-900 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                   placeholder="City, Country"
                                 />
                              </div>

                              <div className="space-y-3">
                                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Intelligence Record (PDF Resume)</label>
                                 <div className={cn(
                                    "relative h-56 flex flex-col items-center justify-center rounded-[40px] border-2 border-dashed transition-all duration-500",
                                    form.resume ? "border-emerald-500 bg-emerald-50 shadow-xl shadow-emerald-50" : "border-slate-200 hover:border-indigo-500/30 bg-slate-50"
                                 )}>
                                    {form.resume ? (
                                       <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
                                          <div className="h-16 w-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
                                             <FileText size={32} />
                                          </div>
                                          <div className="text-center">
                                             <p className="text-sm font-black uppercase tracking-tight text-slate-900">{form.resume.name}</p>
                                             <button type="button" onClick={() => setForm({...form, resume: null})} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-400 mt-2 transition-colors">Abort Upload</button>
                                          </div>
                                       </div>
                                    ) : (
                                       <>
                                          <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-300 mb-4">
                                             <Upload size={24} />
                                          </div>
                                          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Transmit PDF Data</p>
                                          <p className="text-[9px] font-bold text-slate-300 mt-2">Maximum file size: 10MB</p>
                                          <input 
                                             type="file" 
                                             accept=".pdf"
                                             className="absolute inset-0 opacity-0 cursor-pointer"
                                             onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) setForm({...form, resume: file, resumeText: "EXTRACTED DATA FROM " + file.name});
                                             }}
                                          />
                                       </>
                                    )}
                                 </div>
                              </div>
                           </div>

                           <Button 
                               type="submit" 
                               disabled={submitting}
                               className="w-full h-20 rounded-[32px] bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg uppercase tracking-[0.4em] shadow-xl shadow-indigo-100 transition-all active:scale-[0.98]"
                           >
                              {submitting ? (
                                 <div className="flex items-center gap-4">
                                    <Loader2 size={24} className="animate-spin" />
                                    <span>Establishing Link...</span>
                                 </div>
                              ) : (
                                 <div className="flex items-center gap-3">
                                    <span>Initiate Neural Sync</span>
                                    <ArrowRight size={24} />
                                 </div>
                              )}
                           </Button>
                        </form>
                     )}
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Futuristic Footer (Light) */}
      <footer className="relative border-t border-slate-200 py-24 overflow-hidden bg-white">
         <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
            <div className="flex flex-col items-center md:items-start gap-4">
               <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-slate-900 text-white flex items-center justify-center font-black text-sm rounded-lg">N</div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900">NexaWork Neural Grid</span>
               </div>
               <p className="text-[9px] font-bold text-slate-400 max-w-xs text-center md:text-left">
                  Architecting the cognitive future of enterprise intelligence. 
                  All neural transmissions are encrypted with quantum-grade protocols.
               </p>
            </div>
            
            <div className="flex gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
               <a href="#" className="hover:text-indigo-600 transition-colors">Privacy_Shield</a>
               <a href="#" className="hover:text-indigo-600 transition-colors">Terms_of_Sync</a>
               <a href="#" className="hover:text-indigo-600 transition-colors">Neural_Labs</a>
               <a href="#" className="hover:text-indigo-600 transition-colors">Satellite_HQ</a>
            </div>
         </div>
      </footer>

      {/* Global CSS for 3D perspective */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        
        :root {
          --font-space-grotesk: 'Space Grotesk', sans-serif;
        }

        body {
          font-family: var(--font-space-grotesk);
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      ` }} />
    </div>
  );
}
