import TaskCard from "./TaskCard";

const TaskList = ({
  tasks,
  onDelete,
}) => {
  if (!tasks.length) {
    return (
      <p>No tasks available.</p>
    );
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default TaskList;