// Module shims for Vite-bundled assets that tsc can't resolve by itself.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const c: DefineComponent;
  export default c;
}
declare module "*.css" {}
