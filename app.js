var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
var http = require('http').Server(app);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
var io = require('socket.io')(http);
var clients = {};
var clientsUsernames = [];
var usersSocket = {};
var rooms = {};
var roomsNames = [];

app.get('/', function (req, res) {
  res.sendFile(__dirname+'/views/index.html');
});

io.on('connection', function (socket) {
  console.log('user connected');
  socket.on('set username', function (username) {
    console.log(username);
    if (clients[username] == undefined) {
      socket.username = username;
      clients[username] = socket.id;
      usersSocket[socket.id] = username;
      clientsUsernames.push(username);
      socket.emit('arrayOfUsers', {"usersSocket": usersSocket});
    } else if (clients[username] === socket.id) {
      // Ignore for now
    } else {
      usernameAlreadyInUse(socket, username);
    }
  });

  socket.on('get rooms', function (){
    socket.emit('roomsArray', {"rooms": roomsNames});
  });

  socket.on('create room', function (roomName) {
    var newRoom = [];
    roomsNames.push(roomName);
    rooms[roomName] = newRoom;
  });


  socket.on('connect to room', function (roomName) {
    var roomUsers = rooms[roomName];
    if(roomUsers.indexOf(socket.id) == -1)
      rooms[roomName].push(socket.id);
      roomUsers.forEach(function(entry) {
          io.to(entry).emit('user connected', {username: socket.username});
      });
  });

  socket.on('disconnect from room', function(roomName){
      var index = rooms[roomName].indexOf(socket.id);
      rooms[roomName].splice(index, 1);
      var roomUsers = rooms[roomName];
      roomUsers.forEach(function(entry) {
          io.to(entry).emit('user disconnected', {username: socket.username});
      });
  });

  socket.on('get users', function (){
    socket.emit('usersArray', {"userssSocket": clientsUsernames});
  });

  socket.on('typing PW', function (toClient) {io.to(clients[toClient]).emit('typing', {username: socket.username});
  });

  socket.on('stop typing PW', function (toClient) {
    io.to(clients[toClient]).emit('stop typing', {username: socket.username});
  });

  socket.on('new message', function (toClient, data) {
    io.to(clients[toClient]).emit('pwMessage', {username: socket.username, message: data});
  });

    socket.on('new group message', function (roomName, data) {
        var roomUsers = rooms[roomName];
        roomUsers.forEach(function(entry) {
            if(entry!=clients[socket.username])
                io.to(entry).emit('groupMessage', {username: socket.username, message: data});
        });
    });  socket.on('typing to group', function (roomName) {
        var roomUsers = rooms[roomName];
        roomUsers.forEach(function(entry) {
            if (entry != clients[socket.username])
                io.to(users).emit('groupTyping', {username: socket.username});
        });
    });
    socket.on('stop typing to group', function (roomName) {
        var roomUsers = rooms[roomName];
        roomUsers.forEach(function(entry) {
            if (entry != clients[socket.username])
                io.to(users).emit('stopGroupTyping', {username: socket.username});
        });
    });

});


http.listen(8085, function () {
  console.log('8085');
});

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;

function usernameAlreadyInUse(socket, uName) {
  setTimeout(function () {
    socket.emit('usernameUsed', {"usernameInUse": true});
  }, 500);
}