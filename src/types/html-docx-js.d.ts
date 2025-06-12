declare module "html-docx-js/dist/html-docx" {
  const htmlDocx: {
    asBlob: (html: string, options?: any) => Blob;
  };
  export default htmlDocx;
}

declare module "file-saver";
