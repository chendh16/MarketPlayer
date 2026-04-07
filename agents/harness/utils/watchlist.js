/**
 * Watchlist 工具 - 从数据库获取股票池
 */
require('dotenv').config();
const { query } = require('./pg');

/**
 * 获取指定市场的股票池
 */
async function getWatchlist(market) {
  return query(`
    SELECT symbol, name, sector, sector_rank
    FROM watchlist
    WHERE market = $1
    AND is_active = true
    AND is_tradeable = true
    ORDER BY sector, sector_rank
  `, [market]);
}

/**
 * 获取全部可交易股票
 */
async function getAllWatchlist() {
  return query(`
    SELECT symbol, name, market, sector, sector_rank
    FROM watchlist
    WHERE is_active = true
    AND is_tradeable = true
    ORDER BY market, sector, sector_rank
  `);
}

/**
 * 获取按市场分组的股票
 */
async function getWatchlistByMarket() {
  const us = await getWatchlist('us');
  const hk = await getWatchlist('hk');
  const a = await getWatchlist('a');
  return { us, hk, a };
}

module.exports = { getWatchlist, getAllWatchlist, getWatchlistByMarket };