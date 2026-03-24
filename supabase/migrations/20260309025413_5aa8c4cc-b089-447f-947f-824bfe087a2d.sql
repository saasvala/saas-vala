
-- Education category
UPDATE source_code_catalog SET target_industry = 'education', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%school%' OR project_name ILIKE '%student%' OR project_name ILIKE '%education%' 
  OR project_name ILIKE '%college%' OR project_name ILIKE '%university%' OR project_name ILIKE '%academy%' 
  OR project_name ILIKE '%lms%' OR project_name ILIKE '%learn%' OR project_name ILIKE '%tutor%' 
  OR project_name ILIKE '%exam%' OR project_name ILIKE '%course%' OR project_name ILIKE '%classroom%' 
  OR project_name ILIKE '%teacher%' OR project_name ILIKE '%training%' OR project_name ILIKE '%quiz%'
);

-- Healthcare category
UPDATE source_code_catalog SET target_industry = 'healthcare', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%hospital%' OR project_name ILIKE '%health%' OR project_name ILIKE '%medical%' 
  OR project_name ILIKE '%clinic%' OR project_name ILIKE '%pharma%' OR project_name ILIKE '%doctor%' 
  OR project_name ILIKE '%patient%' OR project_name ILIKE '%ambulance%' OR project_name ILIKE '%dental%'
);

-- Food & Hospitality category
UPDATE source_code_catalog SET target_industry = 'food', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%restaurant%' OR project_name ILIKE '%food%' OR project_name ILIKE '%cafe%' 
  OR project_name ILIKE '%kitchen%' OR project_name ILIKE '%recipe%' OR project_name ILIKE '%catering%'
  OR project_name ILIKE '%pos%' OR project_name ILIKE '%zarest%'
);

-- Hotel & Travel category
UPDATE source_code_catalog SET target_industry = 'hospitality', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%hotel%' OR project_name ILIKE '%booking%' OR project_name ILIKE '%travel%' 
  OR project_name ILIKE '%resort%' OR project_name ILIKE '%tourism%' OR project_name ILIKE '%trivik%'
);

-- Transport category
UPDATE source_code_catalog SET target_industry = 'transport', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%taxi%' OR project_name ILIKE '%bus%' OR project_name ILIKE '%transport%' 
  OR project_name ILIKE '%fleet%' OR project_name ILIKE '%delivery%' OR project_name ILIKE '%logistics%'
  OR project_name ILIKE '%courier%' OR project_name ILIKE '%shipping%'
);

-- E-commerce category
UPDATE source_code_catalog SET target_industry = 'ecommerce', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%ecommerce%' OR project_name ILIKE '%shop%' OR project_name ILIKE '%store%' 
  OR project_name ILIKE '%cart%' OR project_name ILIKE '%marketplace%' OR project_name ILIKE '%multi-vendor%'
  OR project_name ILIKE '%amazon%' OR project_name ILIKE '%flipkart%'
);

-- Real Estate category
UPDATE source_code_catalog SET target_industry = 'realestate', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%real-estate%' OR project_name ILIKE '%property%' OR project_name ILIKE '%realestate%' 
  OR project_name ILIKE '%rent%' OR project_name ILIKE '%house%' OR project_name ILIKE '%apartment%'
);

-- Finance category
UPDATE source_code_catalog SET target_industry = 'finance', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%finance%' OR project_name ILIKE '%banking%' OR project_name ILIKE '%payment%' 
  OR project_name ILIKE '%invoice%' OR project_name ILIKE '%accounting%' OR project_name ILIKE '%billing%'
  OR project_name ILIKE '%wallet%' OR project_name ILIKE '%crypto%' OR project_name ILIKE '%loan%'
);

-- HR & Recruitment
UPDATE source_code_catalog SET target_industry = 'hr', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%hrm%' OR project_name ILIKE '%hr-%' OR project_name ILIKE '%payroll%' 
  OR project_name ILIKE '%employee%' OR project_name ILIKE '%recruit%' OR project_name ILIKE '%job%'
  OR project_name ILIKE '%resume%' OR project_name ILIKE '%attendance%'
);

-- Social Media
UPDATE source_code_catalog SET target_industry = 'social', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%social%' OR project_name ILIKE '%chat%' OR project_name ILIKE '%messenger%' 
  OR project_name ILIKE '%dating%' OR project_name ILIKE '%whatsapp%' OR project_name ILIKE '%instagram%'
  OR project_name ILIKE '%tinder%' OR project_name ILIKE '%community%'
);

-- CRM & ERP
UPDATE source_code_catalog SET target_industry = 'crm', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%crm%' OR project_name ILIKE '%erp%' OR project_name ILIKE '%inventory%' 
  OR project_name ILIKE '%management-system%' OR project_name ILIKE '%saas%'
);

-- Media & Entertainment
UPDATE source_code_catalog SET target_industry = 'media', status = 'analyzed', analyzed_at = now()
WHERE status = 'pending' AND (
  project_name ILIKE '%video%' OR project_name ILIKE '%music%' OR project_name ILIKE '%streaming%' 
  OR project_name ILIKE '%podcast%' OR project_name ILIKE '%news%' OR project_name ILIKE '%blog%'
  OR project_name ILIKE '%media%' OR project_name ILIKE '%photo%'
);
