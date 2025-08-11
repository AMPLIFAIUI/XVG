import adapter from "@sveltejs/adapter-static"; 
const config = { 
  kit: { 
    adapter: adapter({
      fallback: 'index.html'
    }),
    prerender: {
      handleHttpError: 'warn'
    }
  } 
}; 
export default config;
