var
 conf = require('./conf.js'),
 ysa = {},
 express = require('express'),
 app = express.createServer(),
 sessionStore = new express.session.MemoryStore(),
 parseCookie = require('connect').utils.parseCookie,
 Session = require('connect').middleware.session.Session,
 stylus = require('stylus'),
 fs = require('fs'),
 knox = require('knox'),
 https = require('https'),
 io = require('socket.io').listen(app),
 mongodb = require('mongodb'),
 db = new mongodb.Db('ysanafa', new mongodb.Server('127.0.0.1', 27017, {})),
 formidable = require('formidable'),
 util = require('util'),
 exec = require('child_process').exec; 

ysa.session = function(req, callback) {
 if(!req.session.user) {
  console.log('restore user');
  ysa.user.findAndModify({'sid': req.cookies['sid']}, [['_id','asc']], {$set: {'sid': req.sessionID}}, {'upsert': true, 'new': true}, function(err, user) {
   ysa.file.find({'user._id': String(user._id)}).toArray(function(err, file) {
    user.file = {};
    file.forEach(function(f) {
     user.file[f.name] = f;
    });
    req.session.user = user;
    req.session.save();
    console.log(user);
    callback();
   });
  });
 }
 else
  callback();
}

//knox = knox.createClient(conf.amazon);

//console.log(require('tty').isatty(process.stdout.fd));
db.oid = function(id) {
 return db.bson_serializer.ObjectID(String(id));
}

db.open(function(error, client) {
 ysa.user = new mongodb.Collection(client, 'user');
 ysa.file = new mongodb.Collection(client, 'file');
 ysa.facebookUser = new mongodb.Collection(client, 'facebookUser');
 ysa.transfer = new mongodb.Collection(client, 'transfer');
});

app.configure(function(){
 app.set('views', __dirname + '/views');
 app.set('view engine', 'jade');
 app.use(express.cookieParser());
 app.use(express.session({
  key: 'sid',
  secret: conf.secret,
  store: sessionStore
 }));
 app.use(express.bodyParser());
 app.use(express.methodOverride());
 app.use(app.router);
 app.use(stylus.middleware({
  src: __dirname + '/views',
  dest: __dirname + '/public',
  compile: function(str, path) {
   return stylus(str)
   .set('filename', path)
   .set('warn', true)
   .set('compress', true);
  }
 }));
 app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
 app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
 app.use(express.errorHandler()); 
});

app.get('/', function(req, res) {
 ysa.session(req, function() {
  res.render('index', {
   'title': 'Ysanafa',
   'file': JSON.stringify(req.session.user.file),
   'facebook': JSON.stringify({
    'appId': conf.facebook.appId
   }),
   'ga': conf.ga,
   'paypal': conf.paypal
  });
 });
});
app.get('/facebookApp', function(req, res) {
 res.end();
});
app.get('/status', function(req, res) {
 res.send('connections: ' + io.sockets.n + '<br>memory: ' + util.inspect(process.memoryUsage()));
});
app.get('/f/:id([a-f0-9]{24})', function(req, res) {
 ysa.session(req, function() {
  ysa.file.findOne({'_id': db.bson_serializer.ObjectID(String(req.params.id))}, function(err, file) {
   readStream = fs.createReadStream('/data/test/' + file.data.path);
   readStream.pipe(res);
   readStream.on('error', function () {
    res.writeHead(404);
    res.end();
   });
   readStream.on('open', function() {
    res.writeHead(200, {'Content-Type': 'image/png'});
   });
   readStream.on('end', function() {
    ysa.transfer.insert({user: {_id: file.user._id}, size: file.data.size, type: 'out'});
   });
  });
 });
});
app.post('/upload', function(req, res) {
 ysa.session(req, function() {
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, file) {
   user = req.session.user;
   for(name in file) {
    f = file[name];
    f.name = name;
    io.log.info('upload ' + f.name);
    exec('md5sum ' + f.path, function (error, stdout, stderr) {
     md5sum = stdout.substr(0, 32);
     path = '/data/test/' + md5sum;
     fs.stat(path, function(err, stats) {
      if(err)
       fs.rename(f.path, path);
     });
     userFile = {
      'user': {
       '_id': user._id
      },
      'name': f.name,
      'type': f.type,
      'data': {
       'path': md5sum,
       'size': f.size
      }
     }

     user.file[userFile.name] = userFile;
     req.session.user = user;
     req.session.save();

     ysa.file.findAndModify({'user._id': userFile.user._id, name: userFile.name}, [['_id','asc']], {$set: userFile}, {upsert: true, new: true}, function(err, file) {
      ysa.transfer.insert({user: {_id: userFile.user._id}, size: userFile.data.size, type: 'in'});
     });
     
     console.log('emit file');
     io.sockets.emit('file', userFile);
    });
   }

//  knox.putFile('/data/test/a', '/data/a', function(err, res){
//  }); 

   res.writeHead(200, {'content-type': 'text/plain'});
   res.write('received upload:\n\n');
   res.end(util.inspect({fields: fields, file: file}));
  });
  form.on('progress', function(bytesReceived, bytesExpected) {   
   progress = bytesReceived / bytesExpected;
   if(!req.updateProgress)
    req.updateProgress = new Date().getTime();
   now = Date.now();
   if((now > req.updateProgress) || (progress == 1)) {
    io.sockets.emit('progress', progress);
    req.updateProgress = now + 500;
   }
  });
 });
});

io.sockets.n = 0;

io.configure(function () {
 io.set('authorization', function (data, accept) {
  if(data.headers.cookie) {
   data.cookie = parseCookie(data.headers.cookie);
   data.sessionID = data.cookie.sid;
   sessionStore.get(data.sessionID, function (err, session) {
    if (err)
     accept(err.message, false); 
    else {
     data.session = new Session(data, session);
     accept(null, true);
    }
   });
  }
  else
   accept('no cookie transmitted', false);
 });
});


io.sockets.on('connection', function (socket) {
 io.sockets.n ++;
 session = socket.handshake.session;
 console.log(session);
 socket.on('authResponse', function(data) {
  console.log('authResponse');
  console.log(data);
  console.log(session);
//  ysa.facebook.update({userID: data['userID']}, {$set: data}, {upsert: true});
//  socket.emit('file', session.user.file);
 

  https.get({
   'host': 'graph.facebook.com',
   'path': '/me?access_token=' + data['accessToken']
  },
  function(res) {
   res.data = '';
   res.on('data', function(data) {
    res.data += data;
   });
   res.on('end', function() {
    console.log('end');
    console.log(res.data);
    data = JSON.parse(res.data);
    console.log(data.id);
    if(data.id) {
     console.log('create user');
     ysa.facebookUser.update({id: data.id}, {$set: data}, {upsert: true});
     ysa.user.update({_id: db.oid(session.user._id)}, {$set: {'facebook': {'id' : data.id}}});
     session.user.facebook = {id: data.id};
    }
//    uuser.update({id: res.data['id']}, {$set: res.data}, {upsert: true});
    socket.emit('user', {
     'facebook': {id: data.id},
     'name': data.first_name
    });
   }); 
  });
 });
 socket.on('disconnect', function() {
  io.sockets.n --;
 });
});

app.listen(8000);
io.log.info('ysanafa listening on port ' + app.address().port + ' in ' + app.settings.env + ' mode');
