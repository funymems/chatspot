export const templateCategories = {
  lead_generation: "Lead generation",
  faq_support: "FAQ & support",
  product_recommendations: "Product recommendations",
  course_sales: "Course sales",
  booking: "Booking inquiries",
  welcome: "Welcome sequence",
  lead_qualification: "Lead qualification",
  follow_up: "Follow-up sequence",
} as const;
export type TemplateCategory = keyof typeof templateCategories;
