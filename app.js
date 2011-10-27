var express = require('express')
 , fs = require('fs')
 , knox = require('knox')
 , https = require('https')
 , io = require('socket.io')
 , mongodb = require('mongodb')
 , formidable = require('formidable')
 , util = require('util')
 , exec = require('child_process').exec
 , conf = require('./conf.js');

//knox = knox.createClient(conf.amazon);

var db = new mongodb.Db('test', new mongodb.Server('127.0.0.1', 27017, {}));
var ysa = {};

db.open(function(error, client) {
 ysa.facebook = new mongodb.Collection(client, 'facebook');
 ysa.user = new mongodb.Collection(client, 'user');
 ysa.file = new mongodb.Collection(client, 'file');
});

var app = module.exports = express.createServer();

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.cookieParser());
  app.use(express.session({'key': 'sid', 'secret': 'secret'}));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

app.get('/', function(req, res) {
 console.log(req.cookies['sid']);
 console.log(req.sessionID);
 req.session.user = req.session.user || {};
 req.session.save();

/*
 ysa.user.findAndModify({'sid': req.cookies['sid']}, [['_id','asc']], {$set: {'sid': req.sessionID}}, {'upsert': true, 'new': true}, function(err, object) {
  req.session.user = object;
  req.session.save();

  ysa.file.find({'user._id': req.session.user._id}).toArray(function(err, docs) {
   console.dir(docs);
  });
 });
*/
 console.log(req.session);
 res.render('index', {
  'title': 'Ysanafa',
  'facebook': {
   'appId': conf.facebook.appId
  }
 });
});
app.get('/status', function(req, res) {
 res.send('connections: ' + io.sockets.n);
});
app.post('/upload', function(req, res) {
 var form = new formidable.IncomingForm();
 form.parse(req, function(err, fields, files) {
  console.log('user update');
//  console.log(req.sessionID);
  console.log(req.session);
  ysa.user.update({'sid': req.sessionID}, {$set: {'upload': true}}, {});
  for(name in files) {
   f = files[name];
   exec('md5sum ' + f['path'], function (error, stdout, stderr) {
    md5sum = stdout.substr(0, 32);
    path = '/data/test/' + md5sum;
    fs.stat(path, function(err, stats) {
     if(err)
      fs.rename(f['path'], path);
    });
    file = {
     'user': {
      '_id': req.session.user._id
     },
     'name': f.name,
     'type': f.type,
     'data': {
      'path': md5sum,
      'size': f.size
     }
    }
//    user = req.session.user;
    req.session.user.file = req.session.user.file || [];
    req.session.user.file.push(file);
    req.session.save();
    ysa.file.update({'user._id': file.user._id, name: file.name}, {$set: file}, {upsert: true, safe: true}, function(err) {
     console.log(err);
     console.log('file update');
    });
   });
  }

  res.writeHead(200, {'content-type': 'text/plain'});
  res.write('received upload:\n\n');
  res.end(util.inspect({fields: fields, files: files}));
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
/*
 path = '/data/test/' + (new Date().getTime());
 req.stream = fs.createWriteStream(path, {flags: 'a'});
 req.addListener('data', function(data) {
  if(!req.boundary)
   console.log(data.match(/(.*)\n/));
  req.stream.write(data);
 });
 req.addListener('end', function() {
//  knox.putFile('/data/test/a', '/data/a', function(err, res){
//  }); 
  res.send('got something');
 });
*/
});

app.listen(8000);

io = io.listen(app);
io.sockets.n = 0;

io.sockets.on('connection', function (socket) {
 io.sockets.n ++;
 socket.on('authResponse', function(data) {
  console.log('authResponse');
  console.log(data);
  ysa.facebook.update({userID: data['userID']}, {$set: data}, {upsert: true});
/*
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
    uuser.update({id: res.data['id']}, {$set: res.data}, {upsert: true});
    socket.emit('user', res.data);
   }); 
  });
*/
 });
 socket.on('disconnect', function() {
  io.sockets.n --;
 });
});

console.log("Ysanafa listening on port %d in %s mode", app.address().port, app.settings.env);
