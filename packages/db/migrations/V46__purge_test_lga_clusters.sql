-- V46: Purge "Test LGA" junk clusters and everything hanging off them.
--
-- Automated test runs kept leaving orphaned market areas (lga = 'Test LGA')
-- together with fixture offers, capacity slots and their child rows in the
-- dev database. This migration removes exactly those rows. No real seed data
-- is touched: no markets or ads reference a junk cluster, and every deletion
-- is scoped by the junk-cluster id set.
--
-- Flyway runs this file inside its own transaction, so the ON COMMIT DROP temp
-- tables live for exactly this migration.

CREATE TEMP TABLE _junk_clusters ON COMMIT DROP AS
  SELECT id FROM catalog.clusters WHERE lga = 'Test LGA';

CREATE TEMP TABLE _junk_offers ON COMMIT DROP AS
  SELECT id FROM catalog.offers
   WHERE cluster_id IN (SELECT id FROM _junk_clusters);

CREATE TEMP TABLE _junk_bids ON COMMIT DROP AS
  SELECT id FROM market.bids
   WHERE offer_id IN (SELECT id FROM _junk_offers);

CREATE TEMP TABLE _junk_stock_holds ON COMMIT DROP AS
  SELECT id FROM orders.stock_holds
   WHERE offer_id IN (SELECT id FROM _junk_offers);

CREATE TEMP TABLE _junk_order_lines ON COMMIT DROP AS
  SELECT id FROM orders.order_lines
   WHERE offer_id IN (SELECT id FROM _junk_offers)
      OR stock_hold_id IN (SELECT id FROM _junk_stock_holds);

-- A want may have "chosen" a test bid (NO ACTION FK) -- clear those refs first.
UPDATE market.wants w SET chosen_bid_id = NULL
 WHERE w.chosen_bid_id IN (SELECT id FROM _junk_bids);

DELETE FROM orders.return_requests r
 WHERE r.order_line_id IN (SELECT id FROM _junk_order_lines);

DELETE FROM catalog.offer_media
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM catalog.offer_price_history
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM catalog.reviews
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM market.bids
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM market.crowd_sales
 WHERE offer_id IN (SELECT id FROM _junk_offers);

-- negotiation_messages cascade with their parent negotiations.
DELETE FROM market.negotiations
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM orders.cart_price_change_events
 WHERE offer_id IN (SELECT id FROM _junk_offers);

DELETE FROM orders.order_lines
 WHERE id IN (SELECT id FROM _junk_order_lines);

DELETE FROM orders.stock_holds
 WHERE id IN (SELECT id FROM _junk_stock_holds);

-- wishlist_items and offer_views cascade with their offers.
DELETE FROM catalog.offers
 WHERE id IN (SELECT id FROM _junk_offers);

DELETE FROM fulfilment.capacity_slots
 WHERE cluster_id IN (SELECT id FROM _junk_clusters);

DELETE FROM catalog.clusters
 WHERE id IN (SELECT id FROM _junk_clusters);