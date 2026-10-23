'use strict';
function createUserAdmin(store,orders){
  const {get,all}=store;
  function detail(id,{section='activity',page=1}={}){
    const user=get('SELECT id,source,invite,inviter,created,seen FROM users WHERE id=?',id);
    if(!user)throw Object.assign(Error('用户不存在'),{status:404});
    if(!['activity','orders','payments','referrals'].includes(section)||!Number.isSafeInteger(page)||page<1)throw Object.assign(Error('用户详情筛选无效'),{status:400});
    const count=(sql,...args)=>get(sql,...args).n;
    const stats={reads:count("SELECT COUNT(*) n FROM activity WHERE user_id=? AND kind='read'",id),shares:count("SELECT COUNT(*) n FROM activity WHERE user_id=? AND kind='share'",id),prints:count('SELECT COUNT(*) n FROM prints WHERE user_id=?',id),orders:count('SELECT COUNT(*) n FROM print_orders WHERE user_id=?',id),referrals:count('SELECT COUNT(*) n FROM users WHERE inviter=?',id),referredPayers:count("SELECT COUNT(*) n FROM users u WHERE inviter=? AND EXISTS(SELECT 1 FROM payments p WHERE p.user_id=u.id AND p.kind='paid')",id),paidFen:count("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE user_id=? AND kind='paid'",id),refundedFen:count("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE user_id=? AND kind='refund'",id)};
    let data;
    if(section==='orders')data=orders.list({days:'all',userId:id,page});
    else{
      const spec={activity:{table:'activity',where:'user_id=?',select:'kind,book,created'},payments:{table:'payments',where:'user_id=?',select:'event_id,order_id,transaction_id,kind,amount,created'},referrals:{table:'users',where:'inviter=?',select:"id,source,created,(SELECT COUNT(*) FROM payments p WHERE p.user_id=users.id AND p.kind='paid') paidOrders"}}[section];
      data={total:count('SELECT COUNT(*) n FROM '+spec.table+' WHERE '+spec.where,id),page,pageSize:25,rows:all('SELECT '+spec.select+' FROM '+spec.table+' WHERE '+spec.where+' ORDER BY created DESC,rowid DESC LIMIT 25 OFFSET ?',id,(page-1)*25)};
    }
    return {user,stats,books:all("SELECT book,COUNT(*) reads,MAX(created) lastRead FROM activity WHERE user_id=? AND kind='read' GROUP BY book ORDER BY lastRead DESC LIMIT 100",id),section,data};
  }
  return {detail};
}
module.exports={createUserAdmin};
