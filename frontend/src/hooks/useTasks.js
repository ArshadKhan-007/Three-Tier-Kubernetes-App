import { useEffect, useState } from "react";

import {
  getTasks,
  createTask,
  deleteTask,
} from "../services/taskService";

const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);

      const data = await getTasks();

      setTasks(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (task) => {
    const createdTask = await createTask(task);

    setTasks((prev) => [...prev, createdTask]);
  };

  const removeTask = async (id) => {
    await deleteTask(id);

    setTasks((prev) =>
      prev.filter((task) => task.id !== id)
    );
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return {
    tasks,
    loading,
    addTask,
    removeTask,
  };
};

export default useTasks;