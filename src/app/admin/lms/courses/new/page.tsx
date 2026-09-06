"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { 
  ChevronLeft, 
  Save, 
  Plus, 
  GripVertical, 
  Trash2, 
  Video, 
  FileText, 
  Settings, 
  BookOpen,
  Layout,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/ButtonLegacy";
import { Badge } from "@/components/ui/BadgeLegacy";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STEPS = [
  { id: 1, label: "Foundation", icon: BookOpen },
  { id: 2, label: "Curriculum", icon: Layout },
  { id: 3, label: "Finalize", icon: Settings },
];

export default function NewCoursePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [courseData, setCourseData] = useState({
    title: "",
    category: "Engineering",
    description: "",
    level: "beginner",
    thumbnail_url: ""
  });

  const [modules, setModules] = useState<any[]>([
    { id: 'm1', title: "Introduction", lessons: [{ id: 'l1', title: "Welcome Video", type: "video" }] }
  ]);

  const addModule = () => {
    setModules([...modules, { 
      id: `m${Date.now()}`, 
      title: "New Module", 
      lessons: [] 
    }]);
  };

  const addLesson = (moduleId: string) => {
    setModules(modules.map(m => {
      if (m.id === moduleId) {
        return { 
          ...m, 
          lessons: [...m.lessons, { id: `l${Date.now()}`, title: "New Lesson", type: "text" }] 
        };
      }
      return m;
    }));
  };

  const saveCourse = async () => {
    setLoading(true);
    try {
      const slug = courseData.title.toLowerCase().replace(/ /g, '-');
      
      // 1. Create Course
      const { data: course, error: cErr } = await supabase
        .from('lms_courses')
        .insert([{ ...courseData, slug, status: 'published' }])
        .select()
        .single();

      if (cErr) throw cErr;

      // 2. Create Modules & Lessons
      for (let i = 0; i < modules.length; i++) {
        const { data: mod, error: mErr } = await supabase
          .from('lms_modules')
          .insert([{ course_id: course.id, title: modules[i].title, order_index: i }])
          .select()
          .single();
        
        if (mErr) throw mErr;

        if (modules[i].lessons.length > 0) {
          const lessonsToInsert = modules[i].lessons.map((l: any, idx: number) => ({
            module_id: mod.id,
            title: l.title,
            order_index: idx,
            content: l.type === 'text' ? 'Content placeholder' : null,
            video_url: l.type === 'video' ? 'https://example.com/video' : null
          }));
          await supabase.from('lms_lessons').insert(lessonsToInsert);
        }
      }

      toast.success("Course published successfully!");
      window.location.href = '/admin/lms';
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell
      moduleKey="lms_courses"
      title="Create New Course"
      subtitle="Design a comprehensive learning path for your teams."
      actions={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => window.location.href = '/admin/lms'}>Cancel</Button>
          {currentStep < 3 ? (
            <Button className="bg-theme-primary text-black font-bold" onClick={() => setCurrentStep(prev => prev + 1)}>
              Next Step
            </Button>
          ) : (
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold" 
              onClick={saveCourse}
              disabled={loading}
            >
              {loading ? "Publishing..." : "Publish Course"}
            </Button>
          )}
        </div>
      }
    >
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Progress Bar */}
        <div className="flex items-center justify-between px-8 py-6 bg-theme-raised rounded-2xl border border-theme-border/50">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-4 group">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                currentStep >= step.id ? "bg-theme-primary text-black shadow-lg shadow-theme-primary/20" : "bg-theme-page text-theme-muted"
              )}>
                <step.icon size={18} />
              </div>
              <div className="hidden md:block">
                <p className="text-[10px] font-black uppercase tracking-widest text-theme-muted mb-0.5">Step 0{step.id}</p>
                <p className={cn("text-xs font-bold", currentStep >= step.id ? "text-theme-fg" : "text-theme-muted")}>{step.label}</p>
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-12 bg-theme-border mx-2 hidden md:block" />}
            </div>
          ))}
        </div>

        <div className="page-card min-h-[400px]">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-theme-muted tracking-widest block mb-2">Course Title</label>
                      <input 
                        value={courseData.title}
                        onChange={e => setCourseData({...courseData, title: e.target.value})}
                        placeholder="e.g. Advanced Sales Mastery" 
                        className="w-full bg-theme-page border border-theme-border rounded-xl h-12 px-4 text-sm font-bold text-theme-fg focus:outline-none focus:ring-1 focus:ring-theme-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-theme-muted tracking-widest block mb-2">Category</label>
                      <Select value={courseData.category} onValueChange={(v) => setCourseData({ ...courseData, category: v })}>
                        <SelectTrigger className="w-full h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Engineering">Engineering</SelectItem>
                          <SelectItem value="Sales">Sales</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="Compliance">Compliance</SelectItem>
                          <SelectItem value="Design">Design</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-theme-muted tracking-widest block mb-2">Description</label>
                    <textarea 
                      value={courseData.description}
                      onChange={e => setCourseData({...courseData, description: e.target.value})}
                      placeholder="What will students learn in this course?" 
                      className="w-full bg-theme-page border border-theme-border rounded-xl p-4 text-sm leading-relaxed text-theme-fg focus:outline-none focus:ring-1 focus:ring-theme-primary transition-all h-[134px] resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-theme-muted">Curriculum Builder</h3>
                  <Button variant="outline" size="sm" onClick={addModule} className="text-[10px] font-black uppercase tracking-widest gap-2">
                    <Plus size={14} /> Add Module
                  </Button>
                </div>

                <div className="space-y-4">
                  {modules.map((mod, mIdx) => (
                    <div key={mod.id} className="p-6 bg-theme-raised rounded-2xl border border-theme-border/50 group">
                      <div className="flex items-center gap-4 mb-6">
                        <GripVertical size={16} className="text-theme-muted" />
                        <input 
                          value={mod.title}
                          onChange={e => {
                            const newMods = [...modules];
                            newMods[mIdx].title = e.target.value;
                            setModules(newMods);
                          }}
                          className="bg-transparent border-none p-0 text-lg font-bold focus:outline-none h-auto w-full text-theme-fg"
                        />
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-500">
                          <Trash2 size={16} />
                        </Button>
                      </div>

                      <div className="space-y-2 ml-8">
                        {mod.lessons.map((lesson: any, lIdx: number) => (
                          <div key={lesson.id} className="flex items-center gap-3 p-3 bg-theme-page rounded-xl border border-theme-border/30 hover:border-theme-primary/30 transition-all">
                            {lesson.type === 'video' ? <Video size={14} className="text-sky-500" /> : <FileText size={14} className="text-amber-500" />}
                            <input 
                              value={lesson.title}
                              onChange={e => {
                                const newMods = [...modules];
                                newMods[mIdx].lessons[lIdx].title = e.target.value;
                                setModules(newMods);
                              }}
                              className="bg-transparent border-none p-0 text-xs font-medium focus:outline-none h-auto w-full text-theme-fg"
                            />
                          </div>
                        ))}
                        <button 
                          onClick={() => addLesson(mod.id)}
                          className="w-full py-3 border-2 border-dashed border-theme-border rounded-xl text-[10px] font-black uppercase tracking-widest text-theme-muted hover:border-theme-primary/30 hover:text-theme-primary transition-all flex items-center justify-center gap-2"
                        >
                          <Plus size={12} /> Add Lesson
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center space-y-8 py-12"
              >
                <div className="h-24 w-24 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto">
                  <CheckCircle2 size={48} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-theme-fg mb-2">Ready to Launch?</h3>
                  <p className="text-theme-muted text-sm max-w-sm mx-auto">Your course curriculum is structured. Once you publish, it will be immediately available to all assigned employees.</p>
                </div>
                <div className="flex justify-center gap-8 text-left max-w-md mx-auto">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-theme-muted tracking-widest">Modules</p>
                    <p className="text-xl font-black text-theme-fg">{modules.length}</p>
                  </div>
                  <div className="h-10 w-px bg-theme-border self-center" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-theme-muted tracking-widest">Total Lessons</p>
                    <p className="text-xl font-black text-theme-fg">
                      {modules.reduce((acc, curr) => acc + curr.lessons.length, 0)}
                    </p>
                  </div>
                  <div className="h-10 w-px bg-theme-border self-center" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-theme-muted tracking-widest">Match Level</p>
                    <Badge variant="secondary" className="bg-theme-primary/10 text-theme-primary border-none">{courseData.level}</Badge>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Toaster position="top-right" expand={false} richColors />
      </div>
    </DashboardShell>
  );
}
