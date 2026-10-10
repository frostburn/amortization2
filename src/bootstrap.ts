import { loading } from "./loading";

async function boot() {
  await loading.show("Loading game files…");
  const { start } = await import("./main");
  await start();
  loading.hide();
}

boot().catch(error => {
  console.error(error);
  loading.fail();
});
