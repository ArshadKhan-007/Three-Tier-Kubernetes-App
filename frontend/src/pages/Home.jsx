import TaskForm from "../components/tasks/TaskForm";
import TaskList from "../components/tasks/TaskList";

import useTasks from "../hooks/useTasks";

const Home = () => {
  const {
    tasks,
    loading,
    addTask,
    removeTask,
  } = useTasks();

  return (
    <div className="container">
      <h1>Task Manager</h1>

      <TaskForm
        onAddTask={addTask}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
        <TaskList
          tasks={tasks}
          onDelete={removeTask}
        />
      )}
    </div>
  );
};

export default Home;