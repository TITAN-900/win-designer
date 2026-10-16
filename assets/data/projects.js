(function () {
  const siteUrl = "https://win-joinery.vercel.app/";
  const imageRoot = "/images/bungalow-bukit-taman-segar/";
  const portraitPhotos = new Set([2, 3, 5, 6, 7, 8, 13, 19, 22, 23, 24, 26, 28, 31, 33, 34, 35, 36, 37, 38]);

  // Source photographs are all 1080 × 810 or 810 × 1080. Keep their original
  // full-resolution JPEG bytes; the 640px WebP candidate is for smaller layouts.
  // See bungalow-photo-audit.json for the complete source/duplicate audit.
  function photo(number, alt) {
    const name = `bungalow-${String(number).padStart(2, "0")}`;
    const width = portraitPhotos.has(number) ? 810 : 1080;
    const height = portraitPhotos.has(number) ? 1080 : 810;
    const src = `${imageRoot}${name}.jpeg`;
    return {
      src,
      original: src,
      srcSet: `${imageRoot}${name}-640.webp 640w, ${src} ${width}w`,
      alt,
      width,
      height
    };
  }

  // One entry is one complete project, not one photograph. To add a future
  // project, add its real photos and project object here, then assign its slug
  // to an INCOMING slot in book-layout.json. No 3D-book code changes are needed.
  const cover = photo(9, "Television joinery with illuminated arched display shelves at Bungalow Bukit Taman Segar");
  const projects = [
    {
      slug: "bungalow-bukit-taman-segar",
      title: "BUNGALOW BUKIT TAMAN SEGAR",
      type: "Residential",
      intro: "",
      description: "A photographic record of the interior and joinery.",
      cover,
      // Ordered from living and dining through kitchens, bedrooms and fitted
      // storage. Alternate views are retained; they are not duplicate files.
      gallery: [
        cover,
        photo(1, "Wide view of the television wall and illuminated arched shelving"),
        photo(12, "Side view of television cabinetry and adjacent stone-lined display recess"),
        photo(37, "Stone-lined display recess with fluted cabinetry and concealed lighting"),
        photo(35, "Timber cabinet beside a plant and decorative vase"),
        photo(10, "Fitted television and storage wall below a timber ceiling detail"),
        photo(8, "Full-height cabinetry framing a television"),
        photo(11, "Timber dining table beside illuminated fitted shelving"),
        photo(21, "Dining space with pendant lights and full-height wall panels"),
        photo(30, "Long fitted counter and illuminated shelving beside the dining table"),
        photo(36, "Arched glazed display cabinetry beneath a timber ceiling"),
        photo(20, "Illuminated arched display cabinet with lower drawers"),
        photo(38, "Curved fluted kitchen island with pendant lighting and fitted appliances"),
        photo(28, "Side view of the fluted kitchen island and woven pendant lights"),
        photo(31, "Tall kitchen cabinetry with refrigerator, oven and illuminated counter"),
        photo(14, "U-shaped kitchen with fitted cabinets and a stone-pattern backsplash"),
        photo(16, "Kitchen cabinetry, refrigerator and window-side sink"),
        photo(15, "Kitchen sink and cooking counter with pale cabinetry"),
        photo(13, "Laundry counter with fitted cabinets and two washing appliances"),
        photo(39, "Bedroom with upholstered headboard, timber ceiling and fitted wardrobe"),
        photo(18, "Bedroom showing the bed, timber wardrobe and dressing area"),
        photo(29, "Upholstered bed beside a full-height timber wardrobe"),
        photo(19, "Bedroom dressing counter with circular mirror and tall cabinetry"),
        photo(25, "Full-height pale wardrobe with long handles and timber-lined recess"),
        photo(3, "Bedroom with timber bed frame, dressing counter and pale wardrobe"),
        photo(7, "View across the bedroom toward its timber headboard and fitted desk"),
        photo(6, "Timber bed frame and headboard with a mattress still in protective wrapping"),
        photo(4, "Fitted dressing desk, circular mirror and overhead timber cabinets"),
        photo(5, "Bedroom television panel and low fitted drawers"),
        photo(2, "Pale full-height wardrobe with circular timber handles"),
        photo(23, "Angled view of pale wardrobe doors and circular timber handles"),
        photo(33, "Compact bedroom with a timber headboard and concealed lighting"),
        photo(34, "Fitted television cabinetry with timber shelves and lower drawers"),
        photo(24, "Timber display shelving above a herringbone floor"),
        photo(22, "Fitted storage with a curved timber corner shelf"),
        photo(26, "Timber vanity cabinet, stone counter and circular mirror"),
        photo(17, "Dark media room with perimeter lighting and furniture in protective covers"),
        photo(32, "Media room facing a low cabinet and softly lit dark wall panels"),
        photo(27, "Side view of the media room with vertical lighting details")
      ],
      beforeAfter: []
    }
  ];

  // Keep the established public data API so the working book and project
  // routes continue using the same loading and presentation pipeline.
  window.WIN_DESIGN_DATA = {
    site: {
      name: "WIN JOINERY SDN BHD",
      wordmark: "WIN JOINERY",
      url: siteUrl,
      hero: cover
    },
    projects
  };
})();
