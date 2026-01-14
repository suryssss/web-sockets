const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const rooms = require("./roomStore")

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "*",
    },
})

app.get("/", (req, res) => {
    res.send("Server is Running")
});

io.on("connection", (socket) => {
    console.log("a user connected", socket.id)


    //creating a room
    socket.on("join-room", ({ roomId, username }) => {
        console.log("join-room received:", roomId, username);
        if (socket.data.roomId) return;
        if (!roomId || !username) {
            return
        }
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: {},
                code: "",
                hostSocketId: socket.id,
                isLocked: false
            }
            console.log("Host assigned:", socket.id);
        }

        const room = rooms[roomId]

        //prevent duplicate users
        if (room.users[socket.id]) {
            return
        }

        //track users
        room.users[socket.id] = { username }


        //join room
        socket.join(roomId)

        socket.data.roomId = roomId;

        // Send current room code to the newly joined user
        socket.emit("sync-code", {
            code: room.code
        });

        socket.emit("lock-state-changed", {
            isLocked: room.isLocked
        });

        socket.emit("host-assigned", {
            isHost: socket.id === room.hostSocketId
        });


        //userList
        const userList = Object.values(room.users).map(
            (u) => u.username
        )

        //joining notification
        io.to(roomId).emit("user-joined", {
            username,
            users: userList,
        })
    })


    socket.on("code-change", ({ roomId, code }) => {
        const room = rooms[roomId]
        if (!room) return

        if (room.isLocked && socket.id !== room.hostSocketId) {
            console.log("room locked cannoty change the code")
            return
        }

        //update source
        room.code = code

        console.log("code updated", roomId)
        console.log("code", room.code)

        socket.to(roomId).emit("sync-code", {
            code: room.code
        })

    })

    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        const room = rooms[roomId];
        if (!room || !room.users[socket.id]) return;

        const username = room.users[socket.id].username;

        delete room.users[socket.id];

        if (room.hostSocketId === socket.id) {
            const remaningsocketIds = Object.keys(room.users)
            if (remaningsocketIds.length > 0) {
                room.hostSocketId = remaningsocketIds[0]
                console.log("new host assigned:", room.hostSocketId)
            }
        }

        const userList = Object.values(room.users).map(
            (u) => u.username
        );

        io.to(roomId).emit("user-left", {
            username,
            users: userList
        });

        if (Object.keys(room.users).length === 0) {
            delete rooms[roomId];
        }

        console.log("user disconnected", socket.id);
    });


    socket.on("toggle-lock", ({ roomId }) => {
        const room = rooms[roomId]
        if (!room) return

        if (room.hostSocketId !== socket.id) {
            console.log("only host can lock the room")
            return
        }
        room.isLocked = !room.isLocked

        console.log("room :",
            roomId,
            room.isLocked ? "Locked" : "Unlocked"
        )

        io.to(roomId).emit("lock-state-changed", {
            isLocked: room.isLocked
        })
    })

})


const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

