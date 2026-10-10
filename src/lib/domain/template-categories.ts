export const templateCategories = {
  lead_generation: "Сбор лидов",
  faq_support: "Вопросы и поддержка",
  product_recommendations: "Подбор товаров",
  course_sales: "Продажа курсов",
  booking: "Запись и бронирование",
  welcome: "Приветствие",
  lead_qualification: "Квалификация лидов",
  follow_up: "Повторные касания",
} as const;
export type TemplateCategory = keyof typeof templateCategories;
