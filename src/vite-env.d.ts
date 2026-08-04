/// <reference types="vite/client" />

// Allow importing CSS/SCSS files with ?inline — Vite returns the content as a string
declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.scss?inline' {
  const content: string;
  export default content;
}

// CSS Modules with ?inline — returns the raw compiled CSS string
declare module '*.module.scss?inline' {
  const content: string;
  export default content;
}
