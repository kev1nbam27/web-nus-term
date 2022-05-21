'use strict';

const bleNusServiceUUID  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const bleNusCharRXUUID   = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const bleNusCharTXUUID   = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const MTU = 40;

var bleDevice;
var bleServer;
var nusService;
var rxCharacteristic;
var txCharacteristic;

var connected = false;
var inputString = "";

function connectionToggle() {
    if (connected) {
        disconnect();
    } else {
        connect();
    }
    document.getElementById('terminal').focus();
}

// Sets button to either Connect or Disconnect
function setConnButtonState(enabled) {
    if (enabled) {
        document.getElementById("clientConnectButton").innerHTML = "Disconnect";
    } else {
        document.getElementById("clientConnectButton").innerHTML = "Connect";
    }
}

function connect() {
    if (!navigator.bluetooth) {
        console.log('WebBluetooth API is not available.\r\n' +
                    'Please make sure the Web Bluetooth flag is enabled.');
        window.term_.io.println('WebBluetooth API is not available on your browser.\r\n' +
                    'Please make sure the Web Bluetooth flag is enabled.');
        return;
    }
    console.log('Requesting Bluetooth Device...');
    navigator.bluetooth.requestDevice({
        //filters: [{services: []}]
        optionalServices: [bleNusServiceUUID],
        acceptAllDevices: true
    })
    .then(device => {
        bleDevice = device; 
        console.log('Found ' + device.name);
        console.log('Connecting to GATT Server...');
        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        return device.gatt.connect();
    })
    .then(server => {
        console.log('Locate NUS service');
        return server.getPrimaryService(bleNusServiceUUID);
    }).then(service => {
        nusService = service;
        console.log('Found NUS service: ' + service.uuid);
    })
    .then(() => {
        console.log('Locate RX characteristic');
        return nusService.getCharacteristic(bleNusCharRXUUID);
    })
    .then(characteristic => {
        rxCharacteristic = characteristic;
        console.log('Found RX characteristic');
    })
    .then(() => {
        console.log('Locate TX characteristic');
        return nusService.getCharacteristic(bleNusCharTXUUID);
    })
    .then(characteristic => {
        txCharacteristic = characteristic;
        console.log('Found TX characteristic');
    })
    .then(() => {
        console.log('Enable notifications');
        return txCharacteristic.startNotifications();
    })
    .then(() => {
        console.log('Notifications started');
        txCharacteristic.addEventListener('characteristicvaluechanged',
                                          handleNotifications);
        connected = true;
        window.term_.io.println('\r\n' + bleDevice.name + ' Connected.');
        nusSendString('\r');
        setConnButtonState(true);
    })
    .catch(error => {
        console.log('' + error);
        window.term_.io.println('' + error);
        if(bleDevice && bleDevice.gatt.connected)
        {
            bleDevice.gatt.disconnect();
        }
    });
}

function disconnect() {
    if (!bleDevice) {
        console.log('No Bluetooth Device connected...');
        return;
    }
    console.log('Disconnecting from Bluetooth Device...');
    if (bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
        connected = false;
        setConnButtonState(false);
        console.log('Bluetooth Device connected: ' + bleDevice.gatt.connected);
    } else {
        console.log('> Bluetooth Device is already disconnected');
    }
}

function onDisconnected() {
    connected = false;
    window.term_.io.println('\r\n' + bleDevice.name + ' Disconnected.');
    setConnButtonState(false);
}

function handleNotifications(event) {
    console.log('notification');
    let value = event.target.value;
    // Convert raw data bytes to character values and use these to 
    // construct a string.
    let str = "";
    for (let i = 0; i < value.byteLength; i++) {
        str += String.fromCharCode(value.getUint8(i));
    }
    window.term_.io.print(str);
}

function keyboardInput(key) {
    // If the ENTER key and BACKSPACE key were not pressed.
    if ((key.charCodeAt(0) != 13) && (key.charCodeAt(0) != 8)) {
        // Ignore not printable characters.
        if (key.length == 1){
            window.termInput_.io.print(key);
            inputString += key;
        }
    } else if (key.charCodeAt(0) != 8){
        window.term_.io.println(inputString);
        inputString += "\n";
        nusSendString(inputString);
        inputString = "";
        window.termInput_.reset();
    }

}

function nusSendString(s) {
    if(bleDevice && bleDevice.gatt.connected) {
        console.log("send: " + s);
        var enc = new TextEncoder(); // always utf-8
        rxCharacteristic.writeValue(enc.encode(s));
    } else {
        window.term_.io.println('Not connected to a device yet.');
    }
}

function initContent(io) {
    io.println("\r\n\
Welcome to Web Device CLI V0.1.0 (03/19/2019)\r\n\
Copyright (C) 2019  makerdiary.\r\n\
\r\n\
This is a Web Command Line Interface via NUS (Nordic UART Service) using Web Bluetooth.\r\n\
\r\n\
  * Source: https://github.com/makerdiary/web-device-cli\r\n\
  * Live:   https://makerdiary.github.io/web-device-cli\r\n\
");
}

function setupHterm() {
    const term = new hterm.Terminal();
    const termInput = new hterm.Terminal();

    term.onTerminalReady = function() {
        const io = this.io.push();
        //io.onVTKeystroke = (string) => {
        //    keyboardInput(string);
        //};
        io.sendString = nusSendString;
        initContent(io);
        this.setCursorVisible(true);
        this.keyboard.characterEncoding = 'raw';
    };
    term.decorate(document.querySelector('#terminal'));
    //term.installKeyboard();
    termInput.onTerminalReady = function() {
        const ioInp = this.io.push();
        ioInp.onVTKeystroke = (string) => {
            keyboardInput(string);
        };
        ioInp.sendString = nusSendString;
        this.setCursorVisible(true);
        this.keyboard.characterEncoding = 'raw';
    };
    termInput.decorate(document.querySelector('#terminalInput'));
    termInput.installKeyboard();

    term.contextMenu.setItems([
        ['Terminal Reset', () => {term.reset(); initContent(window.term_.io);}],
        ['Terminal Clear', () => {term.clearHome();}],
        [hterm.ContextMenu.SEPARATOR],
        ['GitHub', function() {
            lib.f.openWindow('https://github.com/makerdiary/web-device-cli', '_blank');
        }],
    ]);

    termInput.clearHome();

    // Useful for console debugging.
    window.term_ = term;
    window.termInput_ = termInput;
}

window.onload = function() {
    lib.init(setupHterm);
};
