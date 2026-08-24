-- V6: Link lots to categories (home page category filtering)
ALTER TABLE catalog.lots ADD COLUMN category_id UUID REFERENCES catalog.categories(id);
CREATE INDEX idx_lots_category ON catalog.lots(category_id);
