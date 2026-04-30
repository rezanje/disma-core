"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { 
  Plus, Search, Filter, Calendar, User, 
  CheckCircle2, Clock, MoreVertical, 
  Trash2, Edit2, CheckSquare, ListTodo, AlertCircle,
  ImageIcon, ArrowUpRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { TaskStatus, TaskPriority, AppTask } from "@/types"

const PRIORITY_COLORS = {
  Low: "bg-slate-100 text-slate-600 border-slate-200",
  Medium: "bg-blue-100 text-blue-600 border-blue-200",
  High: "bg-rose-100 text-rose-600 border-rose-200",
}

const STATUS_COLORS = {
  Todo: "bg-slate-100 text-slate-600",
  "In Progress": "bg-amber-100 text-amber-600",
  Done: "bg-emerald-100 text-emerald-600",
  Cancelled: "bg-rose-100 text-rose-600",
}

export default function TaskTrackerPage() {
  const tasks = useAppStore(state => state.tasks)
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)
  const addTask = useAppStore(state => state.addTask)
  const addNotification = useAppStore(state => state.addNotification)
  const updateTask = useAppStore(state => state.updateTask)
  const deleteTask = useAppStore(state => state.deleteTask)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("All")
  const [selectedTask, setSelectedTask] = useState<AppTask | null>(null)
  const [commentText, setCommentText] = useState("")
  const [newLink, setNewLink] = useState({ name: "", url: "" })
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false)
  
  // New Task Form State
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium" as TaskPriority,
    assignedToId: "",
    dueDate: format(new Date(), "yyyy-MM-dd")
  })

  const userTasks = tasks.filter(task => 
    task.createdByOriginalId === currentUser?.id || 
    task.assignedToId === currentUser?.id
  )

  const activeTask = selectedTask ? tasks.find(t => t.id === selectedTask.id) : null

  const filteredTasks = userTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) || 
                         task.description.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filterStatus === "All" || task.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const handleAddTask = () => {
    if (!newTask.title || !newTask.assignedToId) {
      toast.error("Judul dan Assignee wajib diisi")
      return
    }

    const task: AppTask = {
      id: uuidv4(),
      title: newTask.title,
      description: newTask.description,
      status: "Todo",
      priority: newTask.priority,
      assignedToId: newTask.assignedToId,
      createdByOriginalId: currentUser?.id || "system",
      dueDate: new Date(newTask.dueDate).toISOString(),
      createdAt: new Date().toISOString()
    }

    addTask(task)
    
    // Create Notification for the assigned user
    addNotification({
      id: uuidv4(),
      userId: newTask.assignedToId,
      title: "New Task Assigned",
      message: `You have been assigned a new task: ${newTask.title}`,
      type: 'task',
      read: false,
      createdAt: new Date().toISOString()
    })

    toast.success("Task berhasil ditambahkan")
    setIsAddOpen(false)
    setNewTask({
      title: "",
      description: "",
      priority: "Medium",
      assignedToId: "",
      dueDate: format(new Date(), "yyyy-MM-dd")
    })
  }

  const handleAddComment = (taskId: string) => {
    if (!commentText.trim() || !currentUser) return
    
    const newComment = {
      userId: currentUser.id,
      text: commentText,
      date: new Date().toISOString()
    }
    
    const task = tasks.find(t => t.id === taskId)
    const existingComments = task?.comments || []
    
    updateTask(taskId, { 
      comments: [...existingComments, newComment] 
    })
    
    setCommentText("")
    toast.success("Komentar ditambahkan")
  }

  const handleAddLink = (taskId: string) => {
    if (!newLink.name || !newLink.url) return
    
    let finalUrl = newLink.url
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`
    }
    
    const task = tasks.find(t => t.id === taskId)
    const existingAttachments = task?.attachments || []
    
    updateTask(taskId, {
      attachments: [...existingAttachments, { name: newLink.name, url: finalUrl, type: 'link' }]
    })
    
    setNewLink({ name: "", url: "" })
    setIsUrlModalOpen(false)
    toast.success("Link ditambahkan")
  }

  const handleFileSelect = async (taskId: string, file: File) => {
    try {
      toast.info("Mengunggah file...")
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      const task = tasks.find(t => t.id === taskId)
      const existingAttachments = task?.attachments || []

      updateTask(taskId, {
        attachments: [...existingAttachments, { 
          name: file.name, 
          url: data.url, 
          type: 'file' 
        }]
      })
      toast.success("File berhasil diupload")
    } catch (e: any) {
      toast.error("Gagal upload file: " + e.message)
    }
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "Todo": return <ListTodo className="w-4 h-4" />
      case "In Progress": return <Clock className="w-4 h-4" />
      case "Done": return <CheckCircle2 className="w-4 h-4" />
      case "Cancelled": return <AlertCircle className="w-4 h-4" />
    }
  }

  const stats = {
    total: userTasks.length,
    todo: userTasks.filter(t => t.status === 'Todo').length,
    inProgress: userTasks.filter(t => t.status === 'In Progress').length,
    done: userTasks.filter(t => t.status === 'Done').length,
    highPriority: userTasks.filter(t => t.priority === 'High' && t.status !== 'Done').length
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-800">Task Tracker</h2>
          <p className="text-sm text-slate-500 font-medium">Monitoring and assign daily operations tasks.</p>
        </div>
        <Button 
          onClick={() => setIsAddOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-200"
        >
          <Plus className="mr-2 h-4 w-4" /> Buat Task Baru
        </Button>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-slate-50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Task</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.total}</h3>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                <CheckSquare className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-amber-50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest">In Progress</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.inProgress}</h3>
              </div>
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-rose-50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Urgent (High)</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.highPriority}</h3>
              </div>
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-white to-emerald-50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Completed</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.done}</h3>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS & LIST */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
               placeholder="Cari task atau deskripsi..." 
               className="pl-10 h-11 bg-white border-slate-200 rounded-xl font-medium"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "All")}>
            <SelectTrigger className="w-full md:w-[180px] h-11 bg-white border-slate-200 rounded-xl font-medium">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">Semua Status</SelectItem>
              <SelectItem value="Todo">Todo</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3">
          {filteredTasks.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed text-slate-400">
              <CheckSquare className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Belum ada task yang sesuai kriteria.</p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const assignee = users.find(u => u.id === task.assignedToId)
              return (
                <div 
                  key={task.id} 
                  onClick={() => setSelectedTask(task)}
                  className="group bg-white hover:bg-slate-50 border border-slate-100 p-5 rounded-2xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className={cn(
                      "mt-1 w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      STATUS_COLORS[task.status]
                    )}>
                      {getStatusIcon(task.status)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-slate-800 leading-tight">{task.title}</h4>
                        <Badge variant="outline" className={cn("text-[8px] font-black uppercase px-2 py-0 border-transparent", PRIORITY_COLORS[task.priority])}>
                          {task.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">{task.description}</p>
                      <div className="flex items-center gap-4 pt-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center overflow-hidden">
                             <User className="w-3 h-3 text-emerald-600" />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600">{assignee?.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">({assignee?.role})</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Calendar className="w-3 h-3" />
                          <span className="text-[10px] font-bold">{format(new Date(task.dueDate), "dd MMM yyyy")}</span>
                        </div>
                      </div>
                      
                      {/* Progress Slider */}
                      <div className="pt-2 flex items-center gap-3">
                         <input 
                           type="range" 
                           min="0" max="100" 
                           className="w-full max-w-[150px] h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                           value={task.progress || 0}
                           onChange={(e) => updateTask(task.id, { progress: Number(e.target.value) })}
                         />
                         <span className="text-[10px] font-black text-slate-500 w-8">{task.progress || 0}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Select 
                      value={task.status} 
                      onValueChange={(val) => updateTask(task.id, { status: val as TaskStatus })}
                    >
                      <SelectTrigger className="h-9 w-32 text-xs font-black rounded-lg border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todo">Todo</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Done">Done</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTask(task.id)
                        toast.error("Task dihapus")
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* TASK DETAIL MODAL */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          {activeTask && (
            <div className="flex flex-col h-[85vh]">
              <div className="bg-slate-900 p-8 text-white">
                <div className="flex items-center gap-2 mb-2">
                   <Badge className={cn("text-[10px] font-black uppercase rounded-lg border-none", PRIORITY_COLORS[activeTask.priority])}>
                      {activeTask.priority} Priority
                   </Badge>
                   <Badge className={cn("text-[10px] font-black uppercase rounded-lg border-none", STATUS_COLORS[activeTask.status])}>
                      {activeTask.status}
                   </Badge>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">{activeTask.title}</h3>
                <p className="text-slate-400 text-xs mt-2 uppercase tracking-widest font-bold">Dibuat pada {format(new Date(activeTask.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50">
                {/* DESCRIPTION */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deskripsi Pekerjaan</h4>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">{activeTask.description || "Tidak ada deskripsi."}</p>
                  </div>
                </section>

                {/* ATTACHMENTS */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Lampiran & Bukti ( {activeTask.attachments?.length || 0} )</h4>
                    <div className="flex gap-2">
                       <input 
                         type="file" 
                         id={`file-upload-${activeTask.id}`} 
                         className="hidden" 
                         onChange={(e) => {
                           if (!e.target.files?.length) return;
                           const file = e.target.files[0];
                           handleFileSelect(activeTask.id, file);
                           e.target.value = ""; // Reset value so the same file can be selected again
                         }}
                       />
                       <Button variant="outline" size="sm" onClick={() => document.getElementById(`file-upload-${activeTask.id}`)?.click()} className="h-8 rounded-xl text-[10px] font-black border-slate-200">
                          UPLOAD FILE
                       </Button>
                       <Button variant="outline" size="sm" onClick={() => setIsUrlModalOpen(true)} className="h-8 rounded-xl text-[10px] font-black border-slate-200">
                          TAMBAH LINK
                       </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {activeTask.attachments?.map((at, i) => (
                      <a key={i} href={at.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all group">
                         <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                            {at.type === 'file' ? <ImageIcon className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                         </div>
                         <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-800 uppercase truncate">{at.name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{at.type}</p>
                         </div>
                      </a>
                    ))}
                    {(!activeTask.attachments || activeTask.attachments.length === 0) && (
                      <div className="col-span-2 py-8 text-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                         Belum ada lampiran bukti kerja.
                      </div>
                    )}
                  </div>
                </section>

                {/* COMMENTS */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Diskusi Pekerjaan ( {activeTask.comments?.length || 0} )</h4>
                  <div className="space-y-3">
                    {activeTask.comments?.map((c, i) => {
                      const commUser = users.find(u => u.id === c.userId)
                      return (
                        <div key={i} className="flex gap-3">
                           <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                              {commUser?.name.charAt(0)}
                           </div>
                           <div className="flex-1 bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                              <div className="flex items-center justify-between mb-1">
                                 <span className="text-[10px] font-black text-slate-800">{commUser?.name}</span>
                                 <span className="text-[8px] font-bold text-slate-400">{format(new Date(c.date), "HH:mm")}</span>
                              </div>
                              <p className="text-xs text-slate-600 font-medium leading-relaxed">{c.text}</p>
                           </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  <div className="pt-4 flex gap-2">
                     <Input 
                       placeholder="Ketik komentar atau saran..." 
                       className="h-12 rounded-2xl border-slate-200 bg-white shadow-inner text-xs font-medium"
                       value={commentText}
                       onChange={(e) => setCommentText(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && handleAddComment(activeTask.id)}
                     />
                     <Button 
                       className="h-12 w-12 rounded-2xl bg-slate-900 hover:bg-black text-white shrink-0"
                       onClick={() => handleAddComment(activeTask.id)}
                     >
                        <ArrowUpRight className="w-5 h-5" />
                     </Button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* URL INPUT DIALOG */}
      <Dialog open={isUrlModalOpen} onOpenChange={setIsUrlModalOpen}>
         <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
               <DialogTitle className="text-lg font-black uppercase tracking-tight">Tambah Link Bukti</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Nama Link</Label>
                  <Input 
                    placeholder="Misal: Google Drive Bukti Foto" 
                    value={newLink.name}
                    onChange={(e) => setNewLink({...newLink, name: e.target.value})}
                    className="h-11 rounded-xl"
                  />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">URL Alamat Link</Label>
                  <Input 
                    placeholder="https://..." 
                    value={newLink.url}
                    onChange={(e) => setNewLink({...newLink, url: e.target.value})}
                    className="h-11 rounded-xl"
                  />
               </div>
            </div>
            <DialogFooter>
               <Button 
                 className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                 onClick={() => selectedTask && handleAddLink(selectedTask.id)}
               >
                  Lampirkan Link
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* ADD TASK DIALOG */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Buat Task Baru</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Judul Task</Label>
              <Input 
                placeholder="Misal: Pick up barang di Vendor A" 
                className="h-11 rounded-xl border-slate-200 font-medium"
                value={newTask.title}
                onChange={(e) => setNewTask({...newTask, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Deskripsi / Instruksi</Label>
              <Input 
                placeholder="Detail pengerjaan task..." 
                className="h-11 rounded-xl border-slate-200 font-medium"
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Prioritas</Label>
                <Select 
                   value={newTask.priority} 
                   onValueChange={(val) => setNewTask({...newTask, priority: val as TaskPriority})}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Deadline</Label>
                <Input 
                  type="date" 
                  className="h-11 rounded-xl border-slate-200 font-medium"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Assign Ke User</Label>
              <Select 
                 value={newTask.assignedToId} 
                 onValueChange={(val) => setNewTask({...newTask, assignedToId: val || ""})}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 font-medium">
                  <SelectValue placeholder="Pilih Akun User">
                    {newTask.assignedToId 
                      ? (() => {
                          const u = users.find(x => x.id === newTask.assignedToId);
                          return u ? `${u.name} (${u.role})` : "Pilih Akun User";
                        })()
                      : "Pilih Akun User"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
               className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg shadow-emerald-100"
               onClick={handleAddTask}
            >
              Simpan & Assign Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
