import { motion } from "motion/react"
import { Card, CardContent } from "@/components/ui/card"

export function LoadingScreen() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-neutral-50">
            <Card className="w-[350px] border-neutral-800 bg-neutral-900/50 backdrop-blur-xl">
                <CardContent className="flex flex-col items-center justify-center p-10 space-y-6">
                    <div className="relative flex items-center justify-center">
                        <motion.div
                            className="absolute w-16 h-16 rounded-full bg-blue-500/20"
                            animate={{
                                scale: [1, 1.5, 1],
                                opacity: [0.5, 0, 0.5],
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />
                        <motion.div
                            className="w-12 h-12 rounded-full bg-blue-500"
                            animate={{
                                scale: [1, 1.1, 1],
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />
                    </div>

                    <div className="space-y-2 text-center">
                        <motion.h2
                            className="text-xl font-semibold tracking-tight"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            Connecting to Nanni Room
                        </motion.h2>
                        <p className="text-sm text-neutral-400">
                            Waiting for server connection...
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
