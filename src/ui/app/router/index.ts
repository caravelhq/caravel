import { createRouter, createWebHashHistory } from "vue-router";
import DashboardPage from "../pages/DashboardPage.vue";
import ChatPage from "../pages/ChatPage.vue";
import TasksPage from "../pages/TasksPage.vue";
import FilesPage from "../pages/FilesPage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  // Map router-link active state to the existing tab-btn-active CSS class.
  linkActiveClass: "tab-btn-active",
  linkExactActiveClass: "tab-btn-active",
  routes: [
    { path: "/dashboard", component: DashboardPage },
    { path: "/chat", component: ChatPage },
    { path: "/tasks", component: TasksPage },
    { path: "/files", component: FilesPage },
    { path: "/", redirect: "/dashboard" },
    { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  ],
});
