"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  CheckCircle2, 
  FileText, 
  HelpCircle,
  Clock,
  Layout,
  MessageSquare,
  ArrowLeft,
  Award,
  Lock,
  Loader2,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth, getDashboardForRole, type Role } from "@/components/layout/AuthProvider";

export default function CoursePlayerPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, permissions, loading: authLoading } = useAuth();

  // Permission guard — this page is a full-screen player so it doesn't use
  // DashboardShell. Manually enforce my_academy view permission.
  useEffect(() => {
    if (authLoading || !user || !permissions) return;
    // Accessible via either academy key; a MISSING or false permission both mean
    // no access (blocks direct-URL entry, not just a hidden link). Admin always allowed.
    const canView = user.role === "admin" || !!permissions["my_academy"]?.can_view || !!permissions["training_academy"]?.can_view;
    if (!canView) router.replace(getDashboardForRole(user.role as Role));
  }, [authLoading, user, permissions, router]);
  const [course, setCourse] = useState<any>(null);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchCourseContent = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!id || !user?.id) return;

    try {
      // 1. Fetch Course with Modules and Lessons
      const { data: courseData, error: courseErr } = await supabase
        .from('lms_courses')
        .select(`
          *,
          lms_modules (
            *,
            lms_lessons (*)
          )
        `)
        .eq('id', id)
        .single();

      if (courseErr) throw courseErr;

      // 2. Fetch/Create Enrollment
      let { data: enrollData, error: enrollErr } = await supabase
        .from('lms_enrollments')
        .select('*')
        .eq('course_id', id)
        .eq('employee_id', user.id)
        .single();

      if (enrollErr && enrollErr.code === 'PGRST116') {
        // Create enrollment if not exists
        const { data: newEnroll, error: createErr } = await supabase
          .from('lms_enrollments')
          .insert({ course_id: id, employee_id: user.id })
          .select()
          .single();
        if (!createErr) enrollData = newEnroll;
      }

      setCourse(courseData);
      setEnrollment(enrollData);

      // Set first lesson as active if none set
      if (!activeLesson && courseData.lms_modules?.[0]?.lms_lessons?.[0]) {
        setActiveLesson(courseData.lms_modules[0].lms_lessons[0]);
      }
    } catch (err) {
      console.error("Course Player Error:", err);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, activeLesson]);

  useEffect(() => {
    fetchCourseContent();

    // Real-time progress sync
    const channel = supabase.channel(`course_${id}_sync`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lms_enrollments', filter: `id=eq.${enrollment?.id}` }, () => fetchCourseContent(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCourseContent, id, enrollment?.id]);

  if (loading && !course) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-theme-muted">
        <Loader2 className="animate-spin mr-2" size={24} /> Loading Course...
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-theme-muted gap-4">
        <p>Course not found.</p>
        <Button onClick={() => router.push('/dashboard/academy')}>Back to Academy</Button>
      </div>
    );
  }

  const totalLessons = course.lms_modules?.reduce((acc: number, mod: any) => acc + (mod.lms_lessons?.length || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-theme-primary/30 flex flex-col">
      
      {/* Top Bar */}
      <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/dashboard/academy")}
            className="h-8 w-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center hover:bg-zinc-800 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="text-sm font-bold truncate max-w-md">{course.title}</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-theme-primary uppercase tracking-widest leading-none mb-1">Your Progress</p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-theme-primary transition-all duration-1000" style={{ width: `${enrollment?.progress_percent || 0}%` }} />
              </div>
              <span className="text-[10px] font-bold text-zinc-500">{enrollment?.progress_percent || 0}%</span>
            </div>
          </div>
          <Button 
            disabled={(enrollment?.progress_percent || 0) < 100}
            size="sm" 
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[10px] uppercase px-4 h-9"
          >
            Claim Certificate
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Main Player Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 flex flex-col">
          {/* Video Player */}
          <div className="aspect-video w-full bg-zinc-900 relative group overflow-hidden">
            {activeLesson?.video_url ? (
              <iframe 
                src={activeLesson.video_url}
                className="absolute inset-0 w-full h-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                <img 
                  src={course.thumbnail_url || "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop"}
                  className="w-full h-full object-cover opacity-40 blur-sm scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative group/play cursor-pointer">
                    <div className="absolute inset-0 bg-theme-primary rounded-full blur-2xl opacity-20 group-hover/play:opacity-40 transition-opacity" />
                    <div className="h-20 w-20 rounded-full bg-theme-primary flex items-center justify-center text-black shadow-2xl relative transition-transform group-hover/play:scale-110">
                      <Play size={32} fill="currentColor" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Lesson Content */}
          <div className="max-w-3xl mx-auto py-12 px-8 w-full space-y-8">
            <div className="space-y-4">
              <Badge className="bg-theme-primary/10 text-theme-primary border-theme-primary/20">Lesson {activeLesson?.order_index || 1}</Badge>
              <h2 className="text-4xl font-black">{activeLesson?.title}</h2>
              <div className="flex items-center gap-6 text-zinc-500 text-xs font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><Clock size={14} /> {activeLesson?.duration_minutes || 0} Mins</span>
              </div>
            </div>

            <div className="prose prose-invert max-w-none text-zinc-400 leading-relaxed">
              {activeLesson?.content ? (
                <div dangerouslySetInnerHTML={{ __html: activeLesson.content }} />
              ) : (
                <p className="text-lg text-zinc-300">Watch the video above to complete this lesson. Use the sidebar to navigate through modules.</p>
              )}
            </div>

            {/* Interaction Buttons */}
            <div className="flex items-center justify-between pt-12 border-t border-white/5">
              <Button variant="ghost" className="text-zinc-500 hover:text-white flex items-center gap-2">
                <ChevronLeft size={18} /> Previous
              </Button>
              <Button className="bg-white text-black hover:bg-zinc-200 font-black px-8 py-6 rounded-2xl flex items-center gap-2">
                Mark as Complete <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        </div>

        {/* Course Sidebar */}
        <aside className={cn(
          "w-80 border-l border-white/5 bg-zinc-950 flex flex-col transition-all duration-300 overflow-hidden",
          !sidebarOpen && "w-0"
        )}>
          <div className="p-6 border-b border-white/5">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Course Curriculum</h3>
            <p className="text-[10px] text-zinc-600 font-bold">{totalLessons} Lessons • {course.lms_modules?.length || 0} Modules</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {course.lms_modules?.sort((a: any, b: any) => a.order_index - b.order_index).map((mod: any, midx: number) => (
              <div key={mod.id} className="border-b border-white/5">
                <div className="px-6 py-4 bg-zinc-900/30 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Module {midx + 1}: {mod.title}</span>
                  <ChevronDown size={12} className="text-zinc-600" />
                </div>
                <div className="py-2">
                  {mod.lms_lessons?.sort((a: any, b: any) => a.order_index - b.order_index).map((les: any) => (
                    <div 
                      key={les.id}
                      onClick={() => setActiveLesson(les)}
                      className={cn(
                        "px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-all cursor-pointer group relative",
                        les.id === activeLesson?.id && "bg-theme-primary/5"
                      )}
                    >
                      {les.id === activeLesson?.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-theme-primary" />}
                      
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        les.id === activeLesson?.id ? "bg-theme-primary/20 text-theme-primary shadow-lg shadow-theme-primary/10" : "bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700"
                      )}>
                        <Play size={14} fill={les.id === activeLesson?.id ? "currentColor" : "none"} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-xs font-bold truncate transition-colors",
                          les.id === activeLesson?.id ? "text-theme-primary" : "text-zinc-300 group-hover:text-white"
                        )}>
                          {les.title}
                        </p>
                        <p className="text-[10px] text-zinc-600 font-bold mt-0.5">{les.duration_minutes} Mins</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-zinc-900/20">
            <div className="flex items-center gap-3 p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Award size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">Graduation</p>
                <p className="text-[9px] text-zinc-500 leading-tight">Complete all modules to unlock certificate.</p>
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
