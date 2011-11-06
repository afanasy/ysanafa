var
 conf = require('./conf.js'),
 ysa = {},
 express = require('express'),
 app = express.createServer(),
 sessionStore = new express.session.MemoryStore(),
 parseCookie = require('connect').utils.parseCookie,
 stylus = require('stylus'),
 fs = require('fs'),
 knox = require('knox'),
 https = require('https'),
 io = require('socket.io').listen(app),
 mongodb = require('mongodb'),
 db = new mongodb.Db('ysanafa', new mongodb.Server('127.0.0.1', 27017, {})),
 formidable = require('formidable'),
 util = require('util'),
 exec = require('child_process').exec,
 hashlib = require('hashlib'),
 qs = require('qs'); 

ysa.session = function(req, callback) {
 if(req.session.user) {
  req.sessionReady = true;
  callback(req);
  return;
 }

 var save = function(user) {
  user.transfer = user.transfer || {};
  if(!user.transfer.available)
   user.transfer.available = 128 / 1024;
  req.session.user = user;
  req.session.save(function(err) {
   req.sessionReady = true;
   callback(req);
  });
 }

 ysa.user.findAndModify({'sid': req.cookies['sid']}, [['_id','asc']], {$set: {'sid.$': req.sessionID}}, {'new': true}, function(err, user) {
  if(!user) {
   console.log('user not found');
   user = {'sid': [req.sessionID], 'created': (new Date).getTime()};
   ysa.user.insert(user, {safe: true}, function(err, user) {
    save(user[0]);
   });
  }
  else {
   console.log('user found');
   if(user.facebook)
    user.facebook = {
     'id': user.facebook.id,
     'first_name': user.facebook.first_name
    };
   save(user);
  }
 });
}

//knox = knox.createClient(conf.amazon);

//console.log(require('tty').isatty(process.stdout.fd));
db.oid = function(id) {
 return db.bson_serializer.ObjectID(String(id));
}

db.open(function(error, client) {
 ysa.user = new mongodb.Collection(client, 'user');
});

app.configure(function() {
 app.set('views', __dirname + '/views');
 app.set('view engine', 'jade');
 app.use(express.cookieParser());
 app.use(express.session({
  key: 'sid',
  secret: conf.secret,
  store: sessionStore
 }));
// app.use(express.bodyParser());
// app.use(express.methodOverride());
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

app.configure('development', function() {
 app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function() {
 app.use(express.errorHandler()); 
});

app.get('/', function(req, res) {
 io.log.info(req.headers['user-agent']);
 if(req.headers['user-agent'].indexOf('Chrome') > 0) {
  ysa.session(req, function(req) {
   res.render('index', {
    'title': 'Ysanafa',
    'user': JSON.stringify(req.session.user),
    'facebook': JSON.stringify({'appId': conf.facebook.appId}),
    'ga': conf.ga,
    'paypal': conf.paypal
   });
  });
 }
 else {
  io.log.info('browser not supported');
  res.writeHead(200, {'content-type': 'text/html'});
  res.end('Browser not supported. Get <a href="http://www.google.com/chrome">Chrome</a>');
 }
});
app.get('/facebookApp', function(req, res) {
 res.end();
});
app.get('/status', function(req, res) {
 res.send('connections: ' + io.sockets.n + '<br>memory: ' + util.inspect(process.memoryUsage()));
});
app.get('/paypal', function(req, res) {
 var log = fs.createWriteStream('paypal', {flags: 'a'});
 log.write(req.method);
 log.write(req.url);
 log.write(util.inspect(req.headers));
 req.on('data', function(data) {
  log.write(data);
 });
 req.on('end', function() {
  log.destroySoon();
  res.writeHead(200, {'content-type': 'text/html'});
  res.end('<form action="paypal" method="post"><input type="submit"><input name="nn" value="vv"></form>');
 });
});
app.post('/paypal', function(req, res) {
 var log = fs.createWriteStream('paypal', {flags: 'a'});
 log.write(req.method);
 log.write(req.url);
 log.write(util.inspect(req.headers));
 req.data = '';
 req.on('data', function(data) {
  req.data += data;
  log.write(data);
 });
 req.on('end', function() {
  https.get({
   'host': 'www.paypal.com',
   'path': '/cgi-bin/webscr?cmd=_notify-validate&' + req.data
  },
  function(paypalResponse) {
   paypalResponse.data = '';
   paypalResponse.on('data', function(data) {
    paypalResponse.data += data;
   });
   paypalResponse.on('end', function() {
    if(paypalResponse.data == 'VERIFIED') {
     req.data = conf.ipn;
     var data = qs.parse(req.data);
     var transfer = parseInt(data.option_selection1, 10); 
     data.custom = '4eb6911df7b155313a000001';   
     ysa.user.update({_id: db.oid(data.custom)}, {$inc: {paid: parseFloat(data.mc_gross), 'transfer.available': transfer}}, {safe: true}, function(err) {
      ysa.user.findOne({_id: db.oid(data.custom)}, function(err, user) {
       if(user && user.sid) {
        user.sid.forEach(function(sessionID) {
         sessionStore.get(sessionID, function (err, session) {
          if(session) {
           session.user.transfer.available = user.transfer.available;
           sessionStore.set(sessionID, session);
          }
         });
        });
       }
      });
     });
     
    }
    log.write(paypalResponse.data);
    log.destroySoon();
    res.writeHead(200, {'content-type': 'text/html'});
    res.end();
   });
  });
 });
});
app.get('/f/:id([a-f0-9]{56})', function(req, res) {
 ysa.session(req, function(req) {
  var find = {'_id': db.oid(req.params.id.substr(0, 24))};
  find['file.' + req.params.id.substr(24, 32)] = {$exists: true};
  ysa.user.findOne(find, function(err, user) {
   var file = user.file[req.params.id.substr(24, 32)];
   readStream = fs.createReadStream('/data/test/' + file.data.path);
   readStream.pipe(res);
   readStream.on('error', function () {
    res.writeHead(404);
    res.end();
   });
   readStream.on('open', function() {
    res.writeHead(200, {'Content-Type': file.type});
   });
   readStream.on('end', function() {
//    ysa.transfer.insert({user: {_id: file.user._id}, size: file.data.size, type: 'out'});
   });
  });
 });
});
app.post('/upload', function(req, res) {
 io.log.info('upload started');
 var respond = function(req) {
  if(!req.sessionReady || !req.upload)
   return;
  for(_id in req.upload)
   if(!req.upload[_id].data.path)
    return;

  for(_id in req.upload) {
   var f = req.upload[_id];
   var user = {};
   user['file.' + _id] = f;
   ysa.user.findAndModify({'_id': db.oid(req.session.user._id)}, [['_id','asc']], {$set: user}, {upsert: true, new: true}, function(err, user) {});
   io.sockets.emit('file', f);

   req.session.user.transfer.done = req.session.user.transfer.done || 0;
   req.session.user.transfer.done += (f.data.size / (1 << 30));
   req.session.save();
   ysa.user.update({'_id': db.oid(req.session.user._id)}, {$inc: {transfer: {done: f.data.size}}});
   io.sockets.emit('transfer', req.session.user.transfer);
   
//  knox.putFile('/data/test/a', '/data/a', function(err, res) {}); 
  }
  res.writeHead(200, {'content-type': 'text/plain'});
  res.write('received upload:\n\n');
  res.end(util.inspect(req.upload));
 }

 ysa.session(req, respond);

 var form = new formidable.IncomingForm();
 form.parse(req, function(err, field, file) {
  if(err) {
   io.log.info('upload failed: ' + err.message);
   return;
  }
  var user = req.session.user;
  req.upload = {};
  for(_id in file) {
   var f = file[_id];

   field[_id] = JSON.parse(field[_id]);
   io.log.info('upload: ' + field[_id].name);
   req.upload[_id] = {
    'name': field[_id].name,
    'type': f.type,
    'x': field[_id].x,
    'y': field[_id].y,
    'created': (new Date).getTime(),
    'data': {
     'size': f.size
    }
   }
   
   exec('md5sum ' + f.path, function (error, stdout, stderr) {
    md5sum = stdout.substr(0, 32);
    path = '/data/test/' + md5sum;
    fs.stat(path, function(err, stats) {
     if(err)
      fs.rename(f.path, path);
    });

    req.upload[_id].data.path = md5sum;

    user.file = user.file || {};
    user.file[_id] = req.upload[_id];

    req.session.user = user;
    req.session.save();

    respond(req);
   });
  }
 });
 form.on('fileBegin', function(name, file) {
  form._id = name;
  var done = form.bytesReceived / form.bytesExpected;
  if(done == 1) {
   io.sockets.emit('progress', {
    '_id': form._id,
    'done': done
   });
  }
 });
 form.on('progress', function(bytesReceived, bytesExpected) {   
  var done = bytesReceived / bytesExpected;
  if(!req.updateProgress)
   req.updateProgress = new Date().getTime();
  now = Date.now();
  if((now > req.updateProgress) || (done == 1)) {
   io.sockets.emit('progress', {
    '_id': form._id,
    'done': done
   });
   req.updateProgress = now + 500;
  }
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
     data.session = new express.session.Session(data, session);
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
 var session = socket.handshake.session;
 var sessionID = socket.handshake.sessionID;
 
 socket.on('authResponse', function(data) {
  sessionStore.get(sessionID, function (err, session) {
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
     console.log(res.data);
     data = JSON.parse(res.data);
     console.log(data.id);
     if(data.id) {
      ysa.user.findOne({'facebook.id': data.id}, function(err, user) {
       if(user) {
        console.log('found facebook user');
        console.log('will push');
        console.log(sessionID);
        ysa.user.update({_id: db.oid(user._id)}, {$set: {facebook: data}, $push: {sid: sessionID}}, {safe: true}, function(err) {
         ysa.user.update({_id: db.oid(session.user._id)}, {$unset: {sid: sessionID}}, {safe: true} ,function(err) {
          sessionStore.destroy(sessionID, function() {
           console.log('reload');
           socket.emit('reload');
          });
         });
        });
       }
       else {
        console.log('new facebook user');
        ysa.user.update({_id: db.oid(session.user._id)}, {$set: {facebook: data}}, {safe: true}, function(err) {
         session.user.facebook = data;
         sessionStore.set(sessionID, session);
         socket.emit('user', {
          'facebook': {
           'id': data.id,
           'first_name': data.first_name
          }
         });
        });
       }
      }); 
     }
    });
   });
  });
 });
 socket.on('logout', function() {
  console.log('logout');
  ysa.user.update({_id: db.oid(session.user._id)}, {$unset: {sid: sessionID}});
  sessionStore.destroy(sessionID, function() {
   console.log('session destroyed');
   socket.emit('logout');
  });
 });
 socket.on('delete', function(file) {
  sessionStore.get(sessionID, function (err, session) {
   io.log.info('delete: ' + file._id);
   delete session.user.file[file._id];
   sessionStore.set(sessionID, session);
   ysa.user.update({_id: db.oid(session.user._id)}, {$unset: {file: file._id}});
  });
 });
 socket.on('file', function(file) {
  sessionStore.get(sessionID, function (err, session) {
   var u = {};
   u['file.' + file._id + '.x'] = session.user.file[file._id].x = file.x;
   u['file.' + file._id + '.y'] = session.user.file[file._id].y = file.y;
   ysa.user.update({_id: db.oid(session.user._id)}, {$set: u});
   sessionStore.set(sessionID, session);
  });
 });
 socket.on('disconnect', function() {
  io.sockets.n --;
 });
});

app.listen(8000);
io.log.info('ysanafa listening on port ' + app.address().port + ' in ' + app.settings.env + ' mode');
