export interface Task {
  id: number
  title: string
  done: boolean
}

const tasks: Task[] = [
  { id: 1, title: 'Ship nuxt-actions v1.4.0', done: true },
  { id: 2, title: 'Write real-world demos', done: false },
  { id: 3, title: 'Update the documentation', done: false },
]
let nextId = 4

export const taskStore = {
  list(): Task[] {
    return tasks.map(task => ({ ...task }))
  },
  stats(): { total: number, done: number, pending: number } {
    const done = tasks.filter(task => task.done).length
    return { total: tasks.length, done, pending: tasks.length - done }
  },
  add(title: string): Task {
    const task: Task = { id: nextId++, title, done: false }
    tasks.push(task)
    return { ...task }
  },
  toggle(id: number): Task | null {
    const task = tasks.find(item => item.id === id)
    if (!task) return null
    task.done = !task.done
    return { ...task }
  },
  remove(id: number): boolean {
    const index = tasks.findIndex(item => item.id === id)
    if (index === -1) return false
    tasks.splice(index, 1)
    return true
  },
}
