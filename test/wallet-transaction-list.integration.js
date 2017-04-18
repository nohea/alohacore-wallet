'use strict';

var path = require('path');
var should = require('chai').should();
var expect = require('chai').expect;
var exec = require('child_process').exec;
var fs = require('fs');
var http = require('http');
var Transaction = require('bitcore-lib').Transaction;


describe('Wallet Transactions List', function() {
  var testDirPath = path.resolve(__dirname, './testdata');
  var execString = __dirname + '/../bin/wallet-transaction-list -f ' +
        testDirPath + '/wallet.json -d "2017-01-01 2017-04-01"';

  describe('Errors', function() {

    it('should throw if response status code is not in the 200 range', function(done) {
      var proxy = http.createServer(function(req, res) {
        res.statusCode = 403;
        res.end();
      });
      proxy.listen(3001, '127.0.0.1');
      exec(execString, function(err, stdout, stderr) {
        expect(stderr).to.match(/Response code from server was 403/);
        expect(stdout).to.equal('');
        proxy.close(done);
      });
    });
  });

  describe('Non-Errors', function() {

    var txList = require(testDirPath + '/txList.json');

    beforeEach(function(done) {
      this.proxy = http.createServer();
      this.proxy.listen(3001, '127.0.0.1', done);
    });

    afterEach(function(done) {
      this.proxy.close(done);
    });

    it('should handle basic tx list that does not match our wallet (edge case).', function(done) {

      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        var tx = new Transaction(txList.notOursTx).toObject();
        tx.inputs[0].inputSatoshis = 23693808;
        tx.inputs[1].inputSatoshis = 500000;
        res.write(JSON.stringify(tx), 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        expect(stdout).to.equal('no results.\n');
        done();
      });
    });

    it('should handle a simple receive-only tx.', function(done) {

      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        var tx = new Transaction(txList.basicReceiveTx).toObject();
        tx.inputs[0].inputSatoshis = 23693808;
        var txStr = JSON.stringify(tx).replace(/\n/g, '') + '\n';
        res.write(txStr, 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        stdout.should.equal('{"txid":"5adc769843a5886d5bc7ac1ee48be9905de15f6ed6974b59c0175ac4aa449721","category":"receive","address":"1JsJffMQUi51v3q5R4DzGvhnPsHKMPSPdJ","outputIndex":0,"satoshis":607235}\n');
        done();
      });

    });


    it('should handle a simple send-only tx.', function(done) {

      var expected = '{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"send","address":"1AdNcCL4XMabbm6aXR3bK8LJhHPRFGH2iv","outputIndex":0,"satoshis":-321093}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"fee","satoshis":-41520}\n';

      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        var tx = new Transaction(txList.basicSendTx).toObject();
        tx.inputs[0].inputSatoshis = 66692455;
        var txStr = JSON.stringify(tx).replace(/\n/g, '') + '\n';
        res.write(txStr, 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        stdout.should.equal(expected);
        done();
      });
    });

    it('should handle large (> 16 kb transactions) streamed from server', function(done) {
      var expected = '{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"send","address":"1AdNcCL4XMabbm6aXR3bK8LJhHPRFGH2iv","outputIndex":0,"satoshis":-321093}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"fee","satoshis":-13338532520}\n';

      var tx = new Transaction(txList.basicSendTx).toObject();
      //add inputs to increase size of tx
      var input = tx.inputs[0];
      input.inputSatoshis = 66692455;
      var txInputs = tx.inputs;
      for(var i = 0; i < 200; i++) { // resulting tx should be 215kb
        txInputs.push(input);
      }
      var txStr = JSON.stringify(tx).replace(/\n/g, '') + '\n';

      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        res.write(txStr, 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        stdout.should.equal(expected);
        done();
      });

    });

    it('should handle a send and a receive tx', function(done) {
      var expected = '{"txid":"5adc769843a5886d5bc7ac1ee48be9905de15f6ed6974b59c0175ac4aa449721","category":"receive","address":"1JsJffMQUi51v3q5R4DzGvhnPsHKMPSPdJ","outputIndex":0,"satoshis":607235}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"send","address":"1AdNcCL4XMabbm6aXR3bK8LJhHPRFGH2iv","outputIndex":0,"satoshis":-321093}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"fee","satoshis":-41520}\n';
      var tx2 = new Transaction(txList.basicSendTx).toObject();
      var tx1 = new Transaction(txList.basicReceiveTx).toObject();
      tx2.inputs[0].inputSatoshis = 66692455;
      tx1.inputs[0].inputSatoshis = 23693808;
      var txStr = '';
      [tx1, tx2].forEach(function(tx) {
        txStr += JSON.stringify(tx).replace(/\n/g, '') + '\n';
      });

      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        res.write(txStr, 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        stdout.should.equal(expected);
        done();
      });
    });

    it('should handle 2 large txs', function(done) {
      var expected = '{"txid":"5adc769843a5886d5bc7ac1ee48be9905de15f6ed6974b59c0175ac4aa449721","category":"receive","address":"1JsJffMQUi51v3q5R4DzGvhnPsHKMPSPdJ","outputIndex":0,"satoshis":607235}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"send","address":"1AdNcCL4XMabbm6aXR3bK8LJhHPRFGH2iv","outputIndex":0,"satoshis":-321093}\n{"txid":"3f53213674d3f3906ce600b0cb18a7c59af890c4904daca4a9220982868f71ef","category":"fee","satoshis":-13338532520}\n';
      var tx2 = new Transaction(txList.basicSendTx).toObject();
      var tx1 = new Transaction(txList.basicReceiveTx).toObject();
      var input1 = tx1.inputs[0];
      var input2 = tx2.inputs[0];
      input2.inputSatoshis = 66692455;
      input1.inputSatoshis = 23693808;
      var txInputs1 = tx1.inputs;
      var txInputs2 = tx2.inputs;
      [txInputs1, txInputs2].forEach(function(txInputs) {
        for(var i = 0; i < 200; i++) { // resulting tx should be 215kb
          txInputs.push(txInputs[0]);
        }
      });
      var txStr = '';
      [tx1, tx2].forEach(function(tx) {
        txStr += JSON.stringify(tx).replace(/\n/g, '') + '\n';
      });


      this.proxy.on('request', function(req, res) {
        res.statusCode = 200;
        res.write(txStr, 'utf8', function(err) {
          if(err) {
            return done(err);
          }
          res.end();
        });
      });

      exec(execString, function(err, stdout, stderr) {
        expect(err).to.be.null;
        stdout.should.equal(expected);
        done();
      });

    });
  });
});

