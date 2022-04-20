const ethers = require("ethers");
const dotenv = require("dotenv");
const child_process = require("child_process");

dotenv.config();

/* COSTANTS */
const CONSTANTS = {
  FACTORY_ADDRESS: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // PancakeSwap V2 factory address
  ROUTER_ADDRESS: "0x10ED43C718714eb63d5aA57B78B54704E256024E", //PancakeSwap V2 router
  BNB_ADDRESS: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // BNB CONTRACT ADDRESS
  BUSD_ADDRESS: "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD CONTRACT ADDRESS
  FACTORY_ABI: [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  ],
  ROUTER_ABI: [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)",
    "function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  ],
  ERC20_ABI: [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      payable: false,
      type: "function",
    },
    {
      constant: false,
      inputs: [
        {
          name: "_spender",
          type: "address",
        },
        {
          name: "_value",
          type: "uint256",
        },
      ],
      name: "approve",
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      payable: false,
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          name: "from",
          type: "address",
        },
        {
          indexed: true,
          name: "to",
          type: "address",
        },
        {
          indexed: false,
          name: "value",
          type: "uint256",
        },
      ],
      name: "Transfer",
      type: "event",
    },
    {
      constant: true,
      inputs: [],
      name: "decimals",
      outputs: [
        {
          name: "",
          type: "uint8",
        },
      ],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
    {
      constant: true,
      inputs: [],
      name: "getReserves",
      outputs: [
        { internalType: "uint112", name: "_reserve0", type: "uint112" },
        { internalType: "uint112", name: "_reserve1", type: "uint112" },
        { internalType: "uint32", name: "_blockTimestampLast", type: "uint32" },
      ],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
    {
      constant: false,
      inputs: [
        {
          name: "_to",
          type: "address",
        },
        {
          name: "_value",
          type: "uint256",
        },
      ],
      name: "transfer",
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      payable: false,
      stateMutability: "nonpayable",
      type: "function",
    },
  ],
};
async function main() {
  transferEventListner();
}
async function transferEventListner() {
  console.log("transferEventListner Started");

  const provider =
    process.env.RPC.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(process.env.RPC)
      : new ethers.providers.JsonRpcProvider(process.env.RPC);

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const account = wallet.connect(provider);
  const accountAddress = await account.address;

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  let topic = ethers.utils.id("Transfer(address,address,uint256)");
  let filter = {
    topics: [topic, null, ethers.utils.hexZeroPad(accountAddress, 32)],
  };

  provider.once(filter, async (response) => {
    /* console.log('resp', response); */

    if(process.platform == "win32") {
      child_process.exec(
        `cmd /c start "" cmd /c start-bot-windows.bat`
      );
    }

    const tokenToSell = response.address;
    const tokenContract = new ethers.Contract(
      tokenToSell,
      CONSTANTS.ERC20_ABI,
      account
    );

    const tokenDecimals = await tokenContract.decimals();
    /* const tokensBought = await provider
      .getTransaction(response.transactionHash)
      .then((x) => {
        console.log('xxx', x.value.toString());
        const iface = new ethers.utils.Interface(CONSTANTS.ERC20_ABI);
        const [z, k] = iface.decodeFunctionData("Transfer", x.data);
        return k.toString();
      }); */

    const tokensBought = await provider
      .getTransaction(response.transactionHash)
      .then((x) => x.wait().then(sad =>
        parseInt(sad.logs[2].data, 16)));

    console.log('start :: approve')
    const receipt = await approve(
      tokenContract,
      tokensBought,
      process.env.GAS_LIMIT,
      process.env.GAS_PRICE,
      tokenDecimals
    );
    console.log('end :: approve')


    const pairAddress = await factory.getPair(
      tokenToSell,
      CONSTANTS.BNB_ADDRESS
    );

    const pairContract = new ethers.Contract(
      pairAddress,
      CONSTANTS.ERC20_ABI,
      account
    );

    try {
      const order = tokenToSell.toLowerCase() > CONSTANTS.BNB_ADDRESS.toLowerCase() ? 0 : 1;

      const result = await reserveLoop(
        pairContract,
        tokensBought,
        tokenDecimals,
        order
      );
      console.log("amountToSell", tokensBought);
      console.log("amountOutMin", result.amountOutMin);

      swapExactTokensForETH(
        router,
        tokensBought,
        result.amountOutMin,
        tokenToSell,
        CONSTANTS.BNB_ADDRESS,
        accountAddress,
        process.env.GAS_LIMIT,
        process.env.GAS_PRICE,
        tokenDecimals
      );
    } catch (error) {
      console.log("Catch error: ", error);
    }
  });
}
async function swapExactTokensForETH(
  router,
  amountToSell,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  console.log("swapExactTokensForETH start ... ");
  const tx = await router.swapExactTokensForETH(
    `${amountToSell}`,
    `${ethers.utils.parseUnits(`${amountOutMin.toFixed(18)}`, "ether")}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5,
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
    }
  );
  tx.wait()
    .then((resp) => {
      console.log(`Token sold successfully! ;)
tx: ${resp.transactionHash}
#############################################`);
    })
    .catch((err) => {
      console.log(`ERROR! Token sold unsuccessful :(
tx: ${err.transactionHash}
#############################################`);
    });
}
async function approve(
  tokenContract,
  amountToSpend,
  gasLimit,
  gasPrice,
  decimals
) {
  const tx = await tokenContract.approve(
    CONSTANTS.ROUTER_ADDRESS,
    `${ethers.utils.parseUnits(amountToSpend.toString(), decimals.toString())}`,
    {
      gasLimit: `${gasLimit}`,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
    }
  );

  const receipt = await tx.wait();

  return receipt;
}

async function reserveLoop(pairContract, tokensBought, tokenDecimals, order) {
  console.log("reserveLoop start");
  let [tokenToSell, BnB, timestamp] = [null, null, null];
  if (order == 0) {
    [BnB, tokenToSell, timestamp] = await pairContract.getReserves();
  } else {
    [tokenToSell, BnB, timestamp] = await pairContract.getReserves();
  }

  const CurrentTokensAmountOut =
    `${BnB.toString()}` / `${tokenToSell.toString()}`; // 381.27busd
  const CurrentBNBAmountOut = `${tokenToSell.toString()}` / `${BnB.toString()}`; // 0.0025bnb

  console.log("BNB -> TOKEN :: Price : ", CurrentTokensAmountOut);
  console.log("BNB <- TOKEN  :: Price : ", CurrentBNBAmountOut);

  const amountOutByOperationPrice =
    (String(String(tokensBought).substring(0, tokenDecimals.toString())) / 10 ** tokenDecimals.toString()) * CurrentTokensAmountOut; // in bnb not formatted

  const tpTokenOut = process.env.OPERATION_PRICE * process.env.TAKE_PROFIT_RATE; // take profit token out
  const slMinTokenOut =
    process.env.OPERATION_PRICE * process.env.STOP_LOSS_RATE_MIN; // stop loss token out
  const slMaxTokenOut =
    process.env.OPERATION_PRICE * process.env.STOP_LOSS_RATE_MAX; // stop loss token out

  console.log("amountOutByOperationPrice", amountOutByOperationPrice);
  console.log("tpTokenOut", tpTokenOut);
  console.log("slMinTokenOut", slMinTokenOut);
  console.log("slMaxTokenOut", slMaxTokenOut);

  if (
    amountOutByOperationPrice > slMinTokenOut &&
    amountOutByOperationPrice < slMaxTokenOut
  ) {
    console.log("sl condition meet");
    return { amountOutMin: slMinTokenOut };
  } else if (amountOutByOperationPrice > tpTokenOut) {
    console.log("tp condition meet");
    return {
      amountOutMin: tpTokenOut
    };
  } else { 
    await timeout(process.env.timeout);
    console.log("#######################");
    console.log("retry...");
    console.log("#######################");
    return await reserveLoop(pairContract, tokensBought, tokenDecimals, order);
  }
}
function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
