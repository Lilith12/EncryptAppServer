var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
// var http = require('http').Server(app);
var https        = require('https');
var fs = require( 'fs' );
var privateKey = fs.readFileSync('../EncryptAppServer/cert/privkey.pem').toString();
var certificate = fs.readFileSync('../EncryptAppServer/cert/fullchain.pem').toString();

var server = https.createServer({
    key: privateKey,
    cert: certificate,
    requestCert: false,
    rejectUnauthorized: false
}, app);


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
var io = require('socket.io')(server);
var clients = {};
var clientsUsernames = [];
var usersSocket = {};
var usersPublicKeys = {};
var rooms = {};
var roomsNames = [];

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/views/index.html');
});

io.on('connection', function (socket) {
    console.log('user connected');
    socket.on('set username', function (username, publicKey) {
        console.log(username);
        if (clients[username] === undefined) {
            socket.username = username;
            socket.publicKey = publicKey;
            clients[username] = socket.id;
            usersPublicKeys[socket.id] = publicKey;
            usersSocket[socket.id] = username;
            clientsUsernames.push(username);
            socket.emit('arrayOfUsers', {"usersSocket": usersSocket});
            socket.emit('usersArray', {"users": clientsUsernames});
        } else if (clients[username] === socket.id) {
            // Ignore for now
        } else {
            usernameAlreadyInUse(socket.id);
        }
    });

    socket.on('disconnect user', function (username) {
        console.log("user disconnected " + username);
        var userSocket = clients[username];
        delete clients[username];
        delete usersSocket[userSocket];
        var index = clientsUsernames.indexOf(username);
        clientsUsernames.splice(index, 1);
    });

    socket.on('get rooms', function () {
        socket.emit('roomsArray', {"rooms": roomsNames});
    });

    socket.on('create room', function (roomName) {
        var newRoom = [];
        roomsNames.push(roomName);
        rooms[roomName] = newRoom;
    });


    socket.on('connect to room', function (roomName) {
        var roomUsers = rooms[roomName];
        console.log(roomUsers);
        console.log(roomUsers.indexOf(socket.id));
        let user = {user: socket.id, username: socket.username, key: socket.publicKey};
        if (roomUsers.find(roomUser => JSON.stringify(roomUser) === JSON.stringify(user)) === undefined) {
            rooms[roomName].push(user);
            roomUsers.forEach(function (entry) {
                io.to(entry.user).emit('user connected', {username: socket.username});
            });
        }
    });

    socket.on('disconnect from room', function (roomName) {
        rooms[roomName] = rooms[roomName].filter(function( obj ) {
            return obj.user !== socket.id;
        });
        console.log("disconnected");
        var roomUsers = rooms[roomName];
        if(rooms[roomName].length > 0){
            roomUsers.forEach(function (entry) {
                io.to(entry.user).emit('user disconnected', {username: socket.username});
            });
        } else {

        }
    });

    socket.on('get users', function () {
        socket.emit('usersArray', {"users": clientsUsernames});
    });

    socket.on('typing PW', function (toClient) {
        io.to(clients[toClient]).emit('typing', {username: socket.username});
    });

    socket.on('stop typing PW', function (toClient) {
        io.to(clients[toClient]).emit('stop typing', {username: socket.username});
    });

    socket.on('new message', function (toClient, data, wasEdited, position, messageCode) {
        var dataToEmit = {
            username: socket.username,
            message: data,
            wasEdited: wasEdited,
            position: position,
            messageCode: messageCode
        };
        io.to(clients[toClient]).emit('pwMessage', dataToEmit);
        io.to(clients[toClient]).emit('pwMessageGlobal', dataToEmit);
    });

    socket.on('new group message', function (toClient, roomName, data, wasEdited, position, messageCode) {
        let roomUsers = rooms[roomName];
        console.log(roomName, data, wasEdited, position, messageCode);
            if (toClient !== socket.username) {
                let dataToEmit = {
                    roomName: roomName,
                    username: socket.username,
                    message: data,
                    wasEdited: wasEdited,
                    position: position,
                    messageCode: messageCode
                };
                io.to(clients[toClient]).emit('groupMessage', dataToEmit);
                io.to(clients[toClient]).emit('groupMessageGlobal', dataToEmit);
            }
    });

    socket.on('typing to group', function (roomName) {
        let roomUsers = rooms[roomName];
        roomUsers.forEach(function (entry) {
            if (entry.user !== clients[socket.username])
                io.to(entry.user).emit('groupTyping', {roomName: roomName, username: socket.username});
        });
    });

    socket.on('stop typing to group', function (roomName) {
        let roomUsers = rooms[roomName];
        roomUsers.forEach(function (entry) {
            if (entry.user !== clients[socket.username])
                io.to(entry.user).emit('stopGroupTyping', {roomName: roomName, username: socket.username});
        });
    });

    socket.on('request public key', function (fromUser) {
        let fromUserSocket = clients[fromUser];
        io.to(clients[socket.username]).emit('requestedPublicKey', {publicKey: usersPublicKeys[fromUserSocket]});
    });

    socket.on('request users public keys', function (roomName) {
        let roomUsers = rooms[roomName];
        io.to(clients[socket.username]).emit('usersPublicKeys', roomUsers);
    });

    checkIfUserIsActive(socket, io);
});


server.listen(8085, function () {
    console.log('8085');
});

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

function checkIfUserIsActive(socket, io) {
    setInterval(function () {
        io.emit('usersArray', {"users": clientsUsernames});
    }, 15000);
}

module.exports = app;

function usernameAlreadyInUse(id) {
    setTimeout(function () {
        io.to(id).emit('usernameUsed', {"usernameInUse": true});
    }, 500);
}