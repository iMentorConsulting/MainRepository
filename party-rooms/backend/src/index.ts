import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth'
import roomRoutes from './routes/rooms'
import { setupSocket } from './socket'

dotenv.config()

const app = express()
const httpServer = createServer(app)

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000'

const io = new Server(httpServer, {
  cors: { origin: allowedOrigin, credentials: true }
})

app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.get('/health', (_, res) => res.json({ status: 'ok' }))

setupSocket(io)

const PORT = Number(process.env.PORT) || 4000
httpServer.listen(PORT, () => console.log(`🎉 Party Rooms server running on port ${PORT}`))
