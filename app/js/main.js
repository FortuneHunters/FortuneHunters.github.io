"use strict";

/**
 * Example JavaScript code that interacts with the page and Web3 wallets
 */

// Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
let web3Instance = null;

// Web3modal instance
let web3Modal;

// Chosen wallet provider given by the dialog window
let provider;

// Address of the selected account
let selectedAccount;

const mainnet = "https://bsc-dataseed.binance.org/";
const testnet = "https://data-seed-prebsc-1-s1.binance.org:8545";
const MAINNET_RPC_URL = testnet;

const contractMainnet = "";
const contractTestnet = "0xC18fc9B450F980eEF3d1bb0D434B115845ec2aae";
const contract = contractTestnet;

/**
 * Setup the orchestra
 */
function init() {
  console.log("Initializing example");
  console.log("WalletConnectProvider is", WalletConnectProvider);
  document.querySelector("#connected").style.display = "none";
  document.querySelector("#random-reward-picker").style.display = "none";
  document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
  document.querySelector("#btn-claim").style.display = "none"

  // Tell Web3modal what providers we have available.
  // Built-in web browser provider (only one can exist as a time)
  // like MetaMask, Brave or Opera is added automatically by Web3modal
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        rpc: {
          56: MAINNET_RPC_URL,
        },
      },
    },
  };

  web3Modal = new Web3Modal({
    providerOptions, // required
  });
}

const getContract = () => {
  return new web3Instance.eth.Contract(ABI, contract);
};

function truncateAddress(address) {
    if (address) {
      const first4 = address.slice(0, 5);
      const last4 = address.slice(address.length - 5);
      return `${first4} ... ${last4}`;
    }
    return null;
  }

/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchAccountData() {
  // Get a Web3 instance for the wallet
  web3Instance = new Web3(provider);

  console.log("Web3 instance is", web3Instance);

  // Get list of accounts of the connected wallet
  const accounts = await web3Instance.eth.getAccounts();

  // MetaMask does not give you all accounts, only the selected account
  console.log("Got accounts", accounts);
  selectedAccount = accounts[0];

  document.querySelector("#selected-account").textContent = truncateAddress(selectedAccount);

  // Get a handl
  const template = document.querySelector("#template-balance");
  const accountContainer = document.querySelector("#accounts");

  // Purge UI elements any previously loaded accounts
  accountContainer.innerHTML = "";

  // Go through all accounts and get their ETH balance
  const rowResolvers = accounts.map(async (address) => {
    const balance = await web3Instance.eth.getBalance(address);
    const user = await getUser();
    if (Number(user.rollAttempts) > 0) {
        document.querySelector("#btn-claim").removeAttribute("disabled");
        document.querySelector("#btn-claim").style.display = "block"
    }
    const rewardsAvailable = await getAvailableRewards();
    // ethBalance is a BigNumber instance
    // https://github.com/indutny/bn.js/
    const ethBalance = web3Instance.utils.fromWei(balance, "ether");
    const humanFriendlyBalance = parseFloat(ethBalance).toFixed(4);
    // Fill in the templated row and put in the document
    const clone = template.content.cloneNode(true);
    clone.querySelector(".totalDeposit").textContent = web3Instance.utils.fromWei(user.totalDeposit, "ether");
    clone.querySelector(".availableRewards").textContent = web3Instance.utils.fromWei(rewardsAvailable, "ether");
    clone.querySelector(".rollAttempts").textContent = user.rollAttempts;
    clone.querySelector(".lastRolledRewards").textContent =
    clone.querySelector(".availableRewards").textContent = web3Instance.utils.fromWei(user.lastRolledRewards, "ether");
    accountContainer.appendChild(clone);
  });

  // Because rendering account does its own RPC commucation
  // with Ethereum node, we do not want to display any results
  // until data for all accounts is loaded
  await Promise.all(rowResolvers);

  // Display fully loaded UI for wallet data
  document.querySelector("#prepare").style.display = "none";
  document.querySelector("#connected").style.display = "block";
}

async function getUser() {
  const contract = getContract();
  return await contract.methods
    .users(selectedAccount)
    .call({ from: selectedAccount }, function (err, res) {
      if (err) {
        console.log("An error occured", err);
        return err;
      }
      console.log("user", res);
      return res;
    });
}

async function getAvailableRewards() {
  const contract = getContract();
  return await contract.methods
    .availableRewards(selectedAccount)
    .call({ from: selectedAccount }, function (err, res) {
      if (err) {
        console.log("An error occured", err);
        return err;
      }
      console.log("available rewards", res);
      return res;
    });
}

/**
 * Fetch account data for UI when
 * - User switches accounts in wallet
 * - User switches networks in wallet
 * - User connects wallet initially
 */
async function refreshAccountData() {
  // If any current data is displayed when
  // the user is switching acounts in the wallet
  // immediate hide this data
  document.querySelector("#prepare").style.display = "block";

  // Disable button while UI is loading.
  // fetchAccountData() will take a while as it communicates
  // with Ethereum node via JSON-RPC and loads chain data
  // over an API call.
  document.querySelector("#btn-connect").setAttribute("disabled", "disabled");
  await fetchAccountData(provider);
  document.querySelector("#btn-connect").removeAttribute("disabled");
}

/**
 * Connect wallet button pressed.
 */
async function onConnect() {
  console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();
  } catch (e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  // Subscribe to accounts change
  provider.on("accountsChanged", (accounts) => {
    fetchAccountData();
  });

  // Subscribe to chainId change
  provider.on("chainChanged", (chainId) => {
    fetchAccountData();
  });

  // Subscribe to networkId change
  provider.on("networkChanged", (networkId) => {
    fetchAccountData();
  });

  await refreshAccountData();
}

function disableButtons() {
  document.querySelector("#btn-deposit").setAttribute("disabled", "disabled");
  document.querySelector("#btn-roll-rewards").setAttribute("disabled", "disabled");
  document.querySelector("#btn-claim").setAttribute("disabled", "disabled");
}

function enableButtons() {
  document.querySelector("#btn-deposit").removeAttribute("disabled");
  document.querySelector("#btn-roll-rewards").removeAttribute("disabled");
  document.querySelector("#btn-claim").removeAttribute("disabled");
}

/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {
  console.log("Killing the wallet connection", provider);

  // TODO: Which providers have close method?
  if (provider.close) {
    await provider.close();

    // If the cached provider is not cleared,
    // WalletConnect will default to the existing session
    // and does not allow to re-scan the QR code with a new wallet.
    // Depending on your use case you may want or want not his behavir.
    await web3Modal.clearCachedProvider();
    provider = null;
  }

  selectedAccount = null;

  // Set the UI back to the initial state
  document.querySelector("#prepare").style.display = "block";
  document.querySelector("#connected").style.display = "none";
}

async function onDeposit() {
  document.querySelector("#btn-deposit").innerHTML = "Depositing..";
  disableButtons();

  const contract = getContract();
  let inputValue = document.querySelector("#deposit-input")?.value;
  return await contract.methods
    .deposit()
    .send({
      from: selectedAccount,
      value: Web3.utils.toWei(inputValue.toString(), "ether"),
    })
    .then(async (res) => {
      console.log("Success", res);
      document.querySelector("#btn-deposit").innerHTML = "Deposit";
      await refreshAccountData();
      enableButtons();
    })
    .catch((err) => {
      console.log(err);
      document.querySelector("#btn-deposit").innerHTML = "Deposit";
      enableButtons();
    });
}

async function onRollRewards() {
  document.querySelector("#btn-roll-rewards").innerHTML = "Rolling..";
  document.querySelector("#random-reward-picker").style.display = "block";
  disableButtons();

  const contract = getContract();
  return await contract.methods
    .rollRewards()
    .send({
      from: selectedAccount,
    })
    .then(async (res) => {
      console.log("Success", res);
      document.querySelector("#btn-roll-rewards").innerHTML = "Roll rewards";
      document.querySelector("#random-reward-picker").style.display = "none";
      await refreshAccountData();
      enableButtons();
    })
    .catch((err) => {
      console.log(err);
      document.querySelector("#btn-roll-rewards").innerHTML = "Roll rewards";
      document.querySelector("#random-reward-picker").style.display = "none";
      enableButtons();
    });
}

async function onClaim() {
  document.querySelector("#btn-claim").innerHTML = "Claiming..";
  disableButtons();

  const contract = getContract();
  return await contract.methods
    .claim()
    .send({
      from: selectedAccount,
    })
    .then(async (res) => {
      console.log("Success", res);
      document.querySelector("#btn-claim").innerHTML = "Claim";
      await refreshAccountData();
      enableButtons();
    })
    .catch((err) => {
      console.log(err);
      document.querySelector("#btn-claim").innerHTML = "Claim";
      enableButtons();
    });
}

/**
 * Main entry point.
 */
window.addEventListener("load", async () => {
  init();
  document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document.querySelector("#btn-deposit").addEventListener("click", onDeposit);

  document
    .querySelector("#btn-roll-rewards")
    .addEventListener("click", onRollRewards);

  document.querySelector("#btn-claim").addEventListener("click", onClaim);
});

// Use requestAnimationFrame with setTimeout fallback
window.requestAnimFrame = (function () {
  return (
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
      window.setTimeout(callback, 1000 / 60);
    }
  );
})();

var percentEl = document.querySelector(".percent");

(function animloop() {
  setTimeout(() => {
    requestAnimFrame(animloop);
    percentEl.innerHTML = Math.round(Math.random() * 200) + "%";
  }, 100);
})();

const ABI = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Claimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Deposited","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"attempts","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"rewards","type":"uint256"}],"name":"RolledRewards","type":"event"},{"inputs":[{"internalType":"address","name":"adr","type":"address"}],"name":"availableRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"deposit","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"initialized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rollRewards","outputs":[{"internalType":"uint256","name":"attemps","type":"uint256"},{"internalType":"uint256","name":"rewards","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"users","outputs":[{"internalType":"address","name":"adr","type":"address"},{"internalType":"uint256","name":"totalDeposit","type":"uint256"},{"internalType":"uint256","name":"depositedAt","type":"uint256"},{"internalType":"uint256","name":"claimedAt","type":"uint256"},{"internalType":"uint256","name":"lastRolledRewards","type":"uint256"},{"internalType":"uint256","name":"lastRolledNr","type":"uint256"},{"internalType":"uint256","name":"rollAttempts","type":"uint256"}],"stateMutability":"view","type":"function"}];
