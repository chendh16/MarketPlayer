require('dotenv').config();
const crypto = require('crypto');
const sdk = eval('require')('futu-api');
const FtWebsocket = sdk.default ?? sdk;
const client = new FtWebsocket();

const pwd = process.env.FUTU_TRADE_PWD ?? '';
const pwdMD5 = crypto.createHash('md5').update(pwd).digest('hex');

client.onlogin = async (ret) => {
  if (!ret) { console.log('login failed'); process.exit(1); }

  await client.UnlockTrade({ c2s: { pwdMD5, unlock: true, securityFirm: 1 } }).catch(()=>{});

  const accRes = await client.GetAccList({ c2s: { userID: 0 } });
  const realAccs = (accRes?.s2c?.accList ?? []).filter(a => a.trdEnv === 1);

  // 试不同的 trdMarket 值（0=全部?, 1=HK, 各种组合）
  const hkAcc = realAccs.find(a => a.trdMarketAuthList?.includes(1));
  if (!hkAcc) { console.log('no HK acc'); process.exit(0); }

  console.log('HK accID:', hkAcc.accID?.toString(), 'accStatus:', hkAcc.accStatus);

  for (const market of [0, 1, 2, 3, 4]) {
    try {
      const header = { trdEnv: 1, accID: hkAcc.accID, trdMarket: market };
      const r = await client.GetFunds({ c2s: { header } });
      console.log(`market=${market} retType:${r?.retType} total:${r?.s2c?.funds?.totalAssets} msg:${r?.retMsg}`);
    } catch(e) {
      console.log(`market=${market} err: retType:${e?.retType} msg:${e?.retMsg}`);
    }
  }

  // 也试试直接不传 trdMarket
  try {
    const header = { trdEnv: 1, accID: hkAcc.accID };
    const r = await client.GetFunds({ c2s: { header } });
    console.log(`no-market retType:${r?.retType} total:${r?.s2c?.funds?.totalAssets} msg:${r?.retMsg}`);
  } catch(e) {
    console.log(`no-market err: retType:${e?.retType} msg:${e?.retMsg}`);
  }

  client.stop && client.stop();
  process.exit(0);
};

client.start('127.0.0.1', 33333, false, '53168330bb52a72b');
