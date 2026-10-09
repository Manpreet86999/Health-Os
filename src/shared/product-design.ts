/** Mint identifies the product; domain colors identify the information. */
export const productThemes = {
  dark: {
    canvas:'#101311', secondary:'#141815', surface:'#191E1A', raised:'#222823', hover:'#293129',
    primary:'#9AF2D0', 'primary-hover':'#B1F8DE', 'primary-ink':'#0B1712', 'secondary-accent':'#B9A9FF',
    text:'#F4F7F4', 'secondary-text':'#AAB2AC', muted:'#737C75', border:'#2B322D', divider:'#39413B',
    train:'#9AF2D0', nutrition:'#FF9A62', energy:'#FF975C', sleep:'#B9A9FF', hydration:'#66D9EF',
    recovery:'#72E6AE', health:'#FF7D83', medical:'#76B8FF', body:'#95DDD0', care:'#E2A9DB',
    insights:'#9AF2D0', pods:'#9AF2D0', reports:'#76B8FF', success:'#72E6AE', warning:'#FF975C', critical:'#FF7D83',
  },
  light: {
    canvas:'#F7F8F6', secondary:'#F1F3F0', surface:'#FFFFFF', raised:'#FFFFFF', hover:'#E9EDE8',
    primary:'#087A62', 'primary-hover':'#066A55', 'primary-ink':'#FFFFFF', 'secondary-accent':'#6757D9',
    text:'#111411', 'secondary-text':'#5F6862', muted:'#858D87', border:'#DDE2DD', divider:'#C8CEC9',
    train:'#087A62', nutrition:'#B94312', energy:'#B94312', sleep:'#6757D9', hydration:'#007C9B',
    recovery:'#16865D', health:'#C73545', medical:'#246BC1', body:'#287E72', care:'#98518F',
    insights:'#087A62', pods:'#087A62', reports:'#246BC1', success:'#16865D', warning:'#B94312', critical:'#C73545',
  },
} as const;
export const productColors = productThemes.dark;
export const productSpacing={compact:8,control:12,card:20,section:24,page:32,widePage:48} as const;
export const productRadii={compact:10,default:18,large:24,modal:28,hero:28} as const;
export const productStates=['loading','empty','error','success','warning','disabled','selected','hover','focus'] as const;
export const productTypography={display:44,pageHeading:36,sectionHeading:24,metric:36,body:16,label:13,metadata:12} as const;
