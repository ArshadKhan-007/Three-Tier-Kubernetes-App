import apiClient from "./apiClient";

export const getTasks = async () => {
  const response = await apiClient.get("/items");
  return response.data;
};

export const createTask = async (payload) => {
  const response = await apiClient.post("/items", payload);
  return response.data;
};

export const deleteTask = async (id) => {
  await apiClient.delete(`/items/${id}`);
};