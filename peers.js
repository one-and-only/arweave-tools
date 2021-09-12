import fetch from 'node-fetch';
import { exec } from 'child_process';
import { table } from 'table';
import { SingleBar } from 'cli-progress';

console.clear();
// detect platform for setting appropriate ping command line options
process.stdout.write('Detecting platform...');
const isDarwin = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWindows = process.platform === "win32";
isDarwin && console.log('Found macOS');
isLinux && console.log('Found Linux');
isWindows && console.log('Found Windows');

var peerList = [];
var tableData = [];
var exitCode = 0; // used for rich status messages
var numOfTopPeers = 0;
const pingBar = new SingleBar({
    format: 'Pinging Nodes |' + '\u001b[32m{bar}\u001b[0m' + '| {percentage}% || {value}/{total} Nodes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
});
const sortBar = new SingleBar({
    format: 'Sorting Node Ping Times |' + '\u001b[32m{bar}\u001b[0m' + '| {percentage}% || {value}/{total} Nodes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
});

fetch('http://arweave.net/peers').then(response => response.json()).then(async peers => {
    pingBar.start(peers.length, 0);

    let promises = [];
    for (let i = 0; i < peers.length; i++) {
        // loopback addresses are not valid!
        if (peers[i].startsWith('127.0.0')) continue;
        let nodeIP = peers[i].split(':')[0];
        promises.push(pingNode(nodeIP));
    }

    Promise.all(promises).then(async () => {
        pingBar.stop();
        sortBar.start(peerList.length, 0);

        peerList.sort(ascendingSort);
        tableData.push(['    Node IP', ' Ping Time (ms)']); // table header

        // top X amount of peers
        numOfTopPeers = peerList.length > 50 ? 50 : peerList.length;
        for (let i = 0; i < numOfTopPeers; i++) {
            let pingTimeStr = '';
            let pingTime = Math.round(peerList[i][1]).toString();

            // center all the data in the table
            const pingSpacesNeeded = 9 - pingTime.length;
            for (let j = 0; j < pingSpacesNeeded; j++) {
                pingTimeStr += ' ';
            }
            pingTimeStr += pingTime;

            tableData.push([peerList[i][0], pingTimeStr]);
            peerList.length < 50 ? exitCode = 2 : null;
        }

        const config = {
            columnDefault: {
                width: 15,
            },
            header: {
                alignment: 'center',
                content: `TOP ${numOfTopPeers} NODE PING TIMES`,
            },
        }
        console.log(table(tableData, config));

        let peerStr = 'FORMATTED PEER LIST (miner command line)\n════════════════════════════════════════\n\n';
        // first row is the header, so bypass that with k = 1
        for (let k = 1; k < tableData.length; k++) {
            peerStr += `peer ${tableData[k][0]} `;
        }

        console.log(`\n\n${peerStr}`);
        exitCodeCheck();
    });
});

function pingNode(nodeIP) {
    return new Promise((resolve) => {
        let program;
        // ping command line options are not universal across all platforms
        if (isDarwin) {
            program = exec(`ping ${nodeIP} -c 1 -t 3`);
        } else if (isLinux) {
            program = exec(`ping ${nodeIP} -c 1 -w 3`);
        } else if (isWindows) {
            program = exec(`ping ${nodeIP} -n 1 -w 3`);
        }
        let output = '';
        program.stdout.on('data', data => {
            output += data;
        });
        program.on('exit', () => {
            const pingTime = output.includes('time=') ? parseFloat(output.split('time=')[1].split(' ')[0]) : Infinity;
            peerList.push([nodeIP, pingTime]) && pingBar.increment() && resolve(pingTime != Infinity ? true : false);
        });
    });
}

function ascendingSort(a, b) {
    sortBar.increment();
    if (a[1] === b[1]) {
        return 0;
    }
    else {
        return (a[1] < b[1]) ? -1 : 1;
    }
}

function exitCodeCheck() {
    switch (exitCode) {
        case 0:
            break;
        case 2:
            console.warn('\x1b[33m', 'WARNING: Insufficient peers received to reach reccomended number of 50 peers');
            break;
        default:
            console.error('\x1b[31m', `ERROR: Unknown error ${exitCode}`);
    }
}