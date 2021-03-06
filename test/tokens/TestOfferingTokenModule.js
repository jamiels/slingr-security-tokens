const truffleAssert = require('truffle-assertions');

const SecurityTokenFactory = artifacts.require("SecurityTokenFactory");
const SecurityToken = artifacts.require("SecurityToken");
const OfferingTokenModuleFactory = artifacts.require("OfferingTokenModuleFactory");
const OfferingTokenModule = artifacts.require("OfferingTokenModule");

let padBytes32 = function(value) {
    return value.padEnd(66, '0');
};

const increaseTime = function(duration) {
    const id = Date.now()

    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [duration],
            id: id,
        }, err1 => {
            if (err1) return reject(err1)

            web3.currentProvider.sendAsync({
                jsonrpc: '2.0',
                method: 'evm_mine',
                id: id+1,
            }, (err2, res) => {
                return err2 ? reject(err2) : resolve(res)
            })
        })
    })
}

contract('OfferingTokenModuleFactory', async(accounts) => {
    let tokenAddress;
    let moduleAddress;

    let owner = accounts[0];
    let operator1 = accounts[1];
    let operator2 = accounts[2];
    let investor1 = accounts[3];
    let investor2 = accounts[4];
    let investor3 = accounts[5];
    let companyWallet = accounts[6];
    let employeesWallet = accounts[7];

    let trancheUnrestricted = padBytes32(web3.fromUtf8('unrestricted'));
    let trancheLocked = padBytes32(web3.fromUtf8('locked'));

    let dataIssuing = padBytes32(web3.fromUtf8('issuing'));
    let dataUserTransfer = padBytes32(web3.fromUtf8('userTransfer'));
    let dataOperatorTransfer = padBytes32(web3.fromUtf8('operatorTransfer'));


    it('configure module', async() => {
        let tokenFactory = await SecurityTokenFactory.deployed();
        await tokenFactory.createInstance('Token A', 'TOKA', 18, [owner, operator1, operator2], {from: owner});
        let tokensCount = await tokenFactory.getInstancesCount.call();
        tokenAddress = await tokenFactory.getInstance.call(tokensCount - 1);

        let moduleFactory = await OfferingTokenModuleFactory.deployed();
        let start = parseInt((new Date().getTime() / 1000)) + 5 * 24 * 60 * 60;
        let end = parseInt((new Date().getTime() / 1000)) + 10 * 24 * 60 * 60;
        await moduleFactory.createInstance(tokenAddress, start, end, {from: owner});
        let modulesCount = await moduleFactory.getInstancesCount.call();
        moduleAddress = await moduleFactory.getInstance.call(modulesCount - 1);

        let token = SecurityToken.at(tokenAddress);
        await token.release({from: owner});
    });


    it('cannot issue before offering starts', async() => {
        let token = SecurityToken.at(tokenAddress);
        let module = OfferingTokenModule.at(moduleAddress);

        await truffleAssert.reverts(module.issueTokens([trancheUnrestricted], [investor1], [1000], {from: operator1}));
        await truffleAssert.reverts(token.issueByTranche(trancheUnrestricted, investor1, 1000, dataIssuing, {from: operator1}));
    });


    it('can reserve tokens before offering starts', async() => {
        let token = SecurityToken.at(tokenAddress);
        let module = OfferingTokenModule.at(moduleAddress);

        await module.reserveTokens(
            [trancheUnrestricted, trancheUnrestricted],
            [companyWallet, employeesWallet],
            [20000, 10000],
            {from: owner}
        );
        let balance = await token.balanceOfByTranche.call(trancheUnrestricted, companyWallet);
        assert.equal(balance, 20000, "Company balance is incorrect");
        balance = await token.balanceOfByTranche.call(trancheUnrestricted, employeesWallet);
        assert.equal(balance, 10000, "Employees balance is incorrect");

        // operators cannot reserve tokens, only the owner
        await truffleAssert.reverts(module.reserveTokens(
            [trancheUnrestricted, trancheUnrestricted],
            [companyWallet, employeesWallet],
            [20000, 10000],
            {from: operator1}
        ));
    });


    it('can issue tokens during offering', async() => {
        let token = SecurityToken.at(tokenAddress);
        let module = OfferingTokenModule.at(moduleAddress);

        // increase time so offer is in progress
        await increaseTime(6 * 24 * 60 * 60);

        await module.issueTokens(
            [trancheUnrestricted, trancheUnrestricted],
            [investor1, investor2],
            [500, 1000],
            {from: operator1}
        );
        let balance = await token.balanceOfByTranche.call(trancheUnrestricted, investor1);
        assert.equal(balance, 500, "Investor 1 balance is incorrect");
        balance = await token.balanceOfByTranche.call(trancheUnrestricted, investor2);
        assert.equal(balance, 1000, "Investor 2 balance is incorrect");
    });


    it('cannot issue tokens if offering is paused', async() => {
        let token = SecurityToken.at(tokenAddress);
        let module = OfferingTokenModule.at(moduleAddress);

        await module.pause({from: owner});

        await truffleAssert.reverts(module.issueTokens([trancheUnrestricted], [investor1], [1000], {from: operator1}));
        await truffleAssert.reverts(token.issueByTranche(trancheUnrestricted, investor1, 1000, dataIssuing, {from: operator1}));

        await module.unpause({from: owner});
    });


    it('cannot issue more tokens after offering is finished', async() => {
        let token = SecurityToken.at(tokenAddress);
        let module = OfferingTokenModule.at(moduleAddress);

        // increase time so offer is finished
        await increaseTime(6 * 24 * 60 * 60);

        await truffleAssert.reverts(module.issueTokens([trancheUnrestricted], [investor1], [1000], {from: operator1}));
        await truffleAssert.reverts(token.issueByTranche(trancheUnrestricted, investor1, 1000, dataIssuing, {from: operator1}));
    });
});