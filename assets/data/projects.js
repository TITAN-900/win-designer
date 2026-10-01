(function () {
  const whatsappNumber = "601172455699";
  const whatsappBase = `https://wa.me/${whatsappNumber}`;
  const siteUrl = "https://win-designer.vercel.app/";

  // Future project workflow:
  // 1. Create a folder such as assets/projects/new-project-name/.
  // 2. Add optimized cover and gallery images.
  // 3. Add one project object to the array below.
  // The homepage and project page will render the new project automatically.
  const projects = [
    {
      slug: "walnut-residence",
      title: "Walnut Residence",
      type: "Living Room",
      intro: "Walnut joinery. Softer light.",
      description: "Fitted storage, warm light, measured proportions.",
      cover: {
        src: "livingroom.jpg.jpg",
        alt: "Warm walnut living room with custom cabinetry and concealed lighting",
        width: 1280,
        height: 854
      },
      gallery: [
        {
          src: "livingroom.jpg.jpg",
          alt: "Walnut living room with custom cabinetry",
          width: 1280,
          height: 854
        },
        {
          src: "assets/projects/optimized/malaysia-luxury-condo-living.webp",
          alt: "Completed Malaysian condominium living room with warm walnut finishes",
          width: 1536,
          height: 1024
        },
        {
          src: "livingroom3.jpg.jpg",
          alt: "Open residential living and dining space with warm lighting",
          width: 1280,
          height: 960
        },
        {
          src: "assets/win20/project-study.webp",
          alt: "Built-in cabinetry detail with hidden lighting",
          width: 1586,
          height: 992
        }
      ],
      beforeAfter: [
        {
          note: "Reference pair. Replace with verified same-room, same-angle client photos when available.",
          before: {
            src: "assets/projects/optimized/before-empty-concrete-condo.webp",
            alt: "Before renovation empty condominium interior with bare concrete floor",
            width: 1536,
            height: 1024
          },
          after: {
            src: "assets/projects/optimized/after-luxury-condo-living.jpeg.webp",
            alt: "After renovation completed condominium living room with warm finishes",
            width: 1280,
            height: 853
          }
        }
      ]
    },
    {
      slug: "stone-kitchen",
      title: "Stone Kitchen",
      type: "Kitchen",
      intro: "Stone and walnut, in balance.",
      description: "Durable surfaces. Fitted cabinetry.",
      cover: {
        src: "livingroom2.jpg.jpg",
        alt: "Luxury kitchen with stone island, walnut cabinetry and warm lighting",
        width: 1280,
        height: 720
      },
      gallery: [
        {
          src: "livingroom2.jpg.jpg",
          alt: "Stone kitchen island with walnut cabinetry",
          width: 1280,
          height: 720
        },
        {
          src: "assets/projects/optimized/malaysia-luxury-kitchen-dining.webp",
          alt: "Malaysian luxury kitchen and dining area with cream stone and walnut cabinetry",
          width: 1536,
          height: 1024
        },
        {
          src: "assets/win20/project-kitchen.webp",
          alt: "Cream marble kitchen with concealed lighting",
          width: 1536,
          height: 1024
        }
      ],
      beforeAfter: []
    },
    {
      slug: "private-suite",
      title: "Private Suite",
      type: "Bedroom",
      intro: "Soft texture. Quiet light.",
      description: "Storage and softness, in balance.",
      cover: {
        src: "livingroom4.jpg.jpg",
        alt: "Calm luxury bedroom with walnut feature wall and soft beige fabrics",
        width: 1280,
        height: 960
      },
      gallery: [
        {
          src: "livingroom4.jpg.jpg",
          alt: "Luxury bedroom with walnut feature wall",
          width: 1280,
          height: 960
        },
        {
          src: "assets/projects/optimized/malaysia-luxury-bedroom.webp",
          alt: "Completed Malaysian bedroom with beige fabrics and hidden lighting",
          width: 1536,
          height: 1024
        },
        {
          src: "assets/win20/project-bedroom.webp",
          alt: "Premium bedroom with fitted wardrobe wall",
          width: 1536,
          height: 1024
        }
      ],
      beforeAfter: []
    },
    {
      slug: "open-living",
      title: "Open Living",
      type: "Living and Dining",
      intro: "Room to gather.",
      description: "Open planning. Calm finishes.",
      cover: {
        src: "livingroom3.jpg.jpg",
        alt: "Open Malaysian condominium living and dining space with warm walnut accents",
        width: 1280,
        height: 960
      },
      gallery: [
        {
          src: "livingroom3.jpg.jpg",
          alt: "Open living and dining room with warm walnut details",
          width: 1280,
          height: 960
        },
        {
          src: "assets/projects/optimized/malaysia-luxury-condo-living.webp",
          alt: "Completed Malaysian luxury condominium living room",
          width: 1536,
          height: 1024
        },
        {
          src: "assets/win20/project-foyer.webp",
          alt: "Walnut foyer cabinetry detail",
          width: 1536,
          height: 1024
        }
      ],
      beforeAfter: []
    },
    {
      slug: "foyer-cabinetry",
      title: "Foyer Cabinetry",
      type: "Custom Cabinetry",
      intro: "An entrance with intention.",
      description: "Concealed storage. Stone detail.",
      cover: {
        src: "assets/win20/project-foyer.webp",
        alt: "Luxury Malaysian foyer cabinetry with walnut finishes",
        width: 1536,
        height: 1024
      },
      gallery: [
        {
          src: "assets/win20/project-foyer.webp",
          alt: "Luxury Malaysian foyer cabinetry",
          width: 1536,
          height: 1024
        },
        {
          src: "assets/projects/optimized/malaysia-walnut-foyer-cabinetry.webp",
          alt: "Walnut foyer cabinetry with hidden lighting",
          width: 1536,
          height: 1024
        },
        {
          src: "assets/win20/project-study.webp",
          alt: "Study cabinetry detail with warm shelves",
          width: 1586,
          height: 992
        }
      ],
      beforeAfter: []
    },
    {
      slug: "built-in-study",
      title: "Built-In Study",
      type: "Study",
      intro: "A quieter place to work.",
      description: "Fitted storage. Warm light.",
      cover: {
        src: "assets/win20/project-study.webp",
        alt: "Elegant Malaysian study with warm built-in cabinetry and hidden LED lighting",
        width: 1586,
        height: 992
      },
      gallery: [
        {
          src: "assets/win20/project-study.webp",
          alt: "Built-in study cabinetry with warm lighting",
          width: 1586,
          height: 992
        },
        {
          src: "assets/projects/optimized/malaysia-study-lounge.webp",
          alt: "Warm Malaysian study lounge with walnut built-ins",
          width: 1586,
          height: 992
        },
        {
          src: "livingroom5.jpg.jpg",
          alt: "Neutral modern interior detail with warm lighting",
          width: 1280,
          height: 960
        }
      ],
      beforeAfter: []
    }
  ];

  window.WIN_DESIGN_DATA = {
    site: {
      name: "WIN DESIGN",
      url: siteUrl,
      logo: "assets/win20/win-design-logo-nav-compact.png",
      hero: {
        src: "assets/win20/hero-condo.webp",
        alt: "Modern Malaysian condominium interior with warm walnut cabinetry and concealed lighting",
        width: 1536,
        height: 1024
      },
      whatsappNumber,
      whatsappBase,
      phoneDisplay: "+60 1172455699",
      phoneHref: "tel:+601172455699"
    },
    projects
  };
})();
