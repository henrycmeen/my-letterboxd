import { GeistSans } from "geist/font/sans";
import { type AppType } from "next/app";
import Head from "next/head";

import "@/styles/globals.css";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <>
      <Head>
        <meta name="theme-color" content="#050505" />
        <meta name="color-scheme" content="dark" />
      </Head>
      <div className={GeistSans.className}>
        <Component {...pageProps} />
      </div>
    </>
  );
};

export default MyApp;
