import { motion } from 'framer-motion';
import Head from 'next/head';

export default function Home() {
  return (
    <div className="text-imsetyBlack dark:text-imsetyWhite bg-imsetyWhite dark:bg-imsetyBlack">
      <Head>
        <title>Reset Button</title>
        <meta name="description" content="Always check in with yourself." />
      </Head>

      <main className="flex  w-full h-full min-w-screen min-h-screen">
        <motion.div
          whileHover={{ scale: 1.1 }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.5 }}
          className="m-auto"
        >
          <motion.div
            whileTap={{
              scale: 0.8
            }}
            transition={{ type: 'spring', duration: 0.6, bounce: 0.5 }}
            className="w-60 h-60 md:w-96 md:h-96  bg-imsetyBlack dark:bg-imsetyWhite rounded-full shadow-2xl"
          />
        </motion.div>
      </main>
    </div>
  );
}
